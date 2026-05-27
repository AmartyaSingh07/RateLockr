"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const redis_1 = require("../store/redis");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../lib/logger");
// =============================================================================
// GET /stats — Global Telemetry Aggregator
// =============================================================================
// Scans all stats:allow:* and stats:deny:* counters in Redis, computes
// global totals, per-client deny rates, and returns the top 5 violators.
//
// Protected by admin API key middleware.
//
// Response shape (matches dashboard useStats hook):
// {
//   totalAllowed: number,
//   totalDenied:  number,
//   activeRules:  number,
//   topThrottled: string[]
// }
// =============================================================================
const router = (0, express_1.Router)();
router.use(auth_1.requireAdmin);
/**
 * Scan Redis for all keys matching a pattern and collect them without
 * blocking the event loop. Uses SCAN with a reasonable COUNT hint.
 */
async function scanKeys(pattern) {
    try {
        const keys = [];
        let cursor = "0";
        do {
            const result = await redis_1.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            if (!result || !Array.isArray(result)) {
                break;
            }
            const [nextCursor, batch] = result;
            cursor = nextCursor || "0";
            if (batch && Array.isArray(batch)) {
                keys.push(...batch);
            }
            else {
                break;
            }
        } while (cursor !== "0");
        return keys;
    }
    catch (err) {
        logger_1.logger.error({ err, pattern }, "Error scanning keys from Redis");
        return [];
    }
}
router.get("/", async (_req, res) => {
    try {
        const clientIdQuery = (_req.query["clientId"] || _req.query["client_id"]);
        if (clientIdQuery) {
            const [allowVal, denyVal, ruleCount] = await Promise.all([
                redis_1.redis.get(`stats:allow:${clientIdQuery}`).catch(() => null),
                redis_1.redis.get(`stats:deny:${clientIdQuery}`).catch(() => null),
                redis_1.redis.hlen(`rl:rules:${clientIdQuery}`).catch(() => 0),
            ]);
            const allowed = parseInt(allowVal ?? "0", 10) || 0;
            const denied = parseInt(denyVal ?? "0", 10) || 0;
            // ─── Time-Series Buffering for Client ───
            const lastCumulativeKey = `rl:metrics:last_cumulative:${clientIdQuery}`;
            const prevData = await redis_1.redis.hmget(lastCumulativeKey, "allowed", "denied").catch(() => [null, null]);
            const prevAllowed = prevData && prevData[0] ? parseInt(prevData[0], 10) : null;
            const prevDenied = prevData && prevData[1] ? parseInt(prevData[1], 10) : null;
            const currentDeltaAllowed = prevAllowed !== null ? Math.max(0, allowed - prevAllowed) : 0;
            const currentDeltaDenied = prevDenied !== null ? Math.max(0, denied - prevDenied) : 0;
            await redis_1.redis.hmset(lastCumulativeKey, "allowed", String(allowed), "denied", String(denied)).catch(() => { });
            const timestamp = Math.floor(Date.now() / 1000);
            const snapshot = { timestamp, allowed: currentDeltaAllowed, denied: currentDeltaDenied };
            const timelineKey = `rl:metrics:timeline:${clientIdQuery}`;
            await redis_1.redis.lpush(timelineKey, JSON.stringify(snapshot)).catch(() => { });
            await redis_1.redis.ltrim(timelineKey, 0, 29).catch(() => { });
            const rawTimeline = await redis_1.redis.lrange(timelineKey, 0, -1).catch(() => []);
            const timeline = rawTimeline.map((item) => {
                const parsed = typeof item === "string" ? JSON.parse(item) : item;
                let timeVal;
                if (typeof parsed.timestamp === "number") {
                    timeVal = parsed.timestamp;
                }
                else {
                    const parsedInt = parseInt(parsed.timestamp, 10);
                    timeVal = !isNaN(parsedInt) && String(parsedInt) === String(parsed.timestamp)
                        ? parsedInt
                        : Math.floor(Date.now() / 1000);
                }
                const displayTime = new Date(timeVal * 1000).toLocaleTimeString("en-US", {
                    hour12: false,
                    timeZone: "UTC",
                });
                return {
                    timestamp: displayTime,
                    allowed: parsed.allowed,
                    denied: parsed.denied,
                };
            }).reverse();
            res.status(200).json({
                totalAllowed: allowed,
                totalDenied: denied,
                activeRules: ruleCount,
                topThrottled: denied > 0 ? [clientIdQuery] : [],
                timeline,
            });
            return;
        }
        // Discover all keys using robust SCAN fallbacks
        const [allowKeys, denyKeys, ruleKeys] = await Promise.all([
            scanKeys("stats:allow:*").catch(() => []),
            scanKeys("stats:deny:*").catch(() => []),
            scanKeys("rl:rules:*").catch(() => []),
        ]);
        const allowKeysList = allowKeys ?? [];
        const denyKeysList = denyKeys ?? [];
        const ruleKeysList = ruleKeys ?? [];
        // Extract unique client IDs
        const clientIds = new Set();
        for (const key of allowKeysList) {
            if (key && typeof key === "string" && key.startsWith("stats:allow:")) {
                const clientId = key.slice("stats:allow:".length);
                clientIds.add(clientId);
            }
        }
        for (const key of denyKeysList) {
            if (key && typeof key === "string" && key.startsWith("stats:deny:")) {
                const clientId = key.slice("stats:deny:".length);
                clientIds.add(clientId);
            }
        }
        const clientList = Array.from(clientIds);
        let totalAllowed = 0;
        let totalDenied = 0;
        const clients = [];
        // Pipelined batch counter lookup
        if (clientList.length > 0) {
            try {
                const pipeline = redis_1.redis.pipeline();
                for (const clientId of clientList) {
                    pipeline.get(`stats:allow:${clientId}`);
                    pipeline.get(`stats:deny:${clientId}`);
                }
                const pipelineResults = await pipeline.exec();
                const results = pipelineResults ?? [];
                for (let i = 0; i < clientList.length; i++) {
                    const allowResult = results?.[i * 2];
                    const denyResult = results?.[i * 2 + 1];
                    const allowResultValue = allowResult && Array.isArray(allowResult) ? allowResult[1] : null;
                    const denyResultValue = denyResult && Array.isArray(denyResult) ? denyResult[1] : null;
                    const allowed = parseInt(allowResultValue ?? "0", 10) || 0;
                    const denied = parseInt(denyResultValue ?? "0", 10) || 0;
                    const clientTotal = allowed + denied;
                    totalAllowed += allowed;
                    totalDenied += denied;
                    clients.push({
                        clientId: clientList[i],
                        allowed,
                        denied,
                        denyRate: clientTotal > 0 ? denied / clientTotal : 0,
                    });
                }
            }
            catch (pipelineErr) {
                logger_1.logger.error({ pipelineErr }, "Error executing Redis statistics lookup pipeline");
            }
        }
        // Compute active rules count safely
        let activeRules = 0;
        if (ruleKeysList.length > 0) {
            try {
                const rulesPipeline = redis_1.redis.pipeline();
                for (const key of ruleKeysList) {
                    rulesPipeline.hlen(key);
                }
                const rulesResults = await rulesPipeline.exec();
                const results = rulesResults ?? [];
                for (const result of results) {
                    const countVal = result && Array.isArray(result) ? result[1] : 0;
                    activeRules += countVal ?? 0;
                }
            }
            catch (rulesErr) {
                logger_1.logger.error({ rulesErr }, "Error executing rules check pipeline");
            }
        }
        // Extract top 5 violators client IDs
        const topThrottled = clients
            .filter((c) => c && c.denied > 0)
            .sort((a, b) => b.denied - a.denied)
            .slice(0, 5)
            .map((c) => c.clientId) ?? [];
        // ─── Time-Series Buffering in Redis ───
        const prevData = await redis_1.redis.hmget("rl:metrics:last_cumulative", "allowed", "denied").catch(() => [null, null]);
        const prevAllowed = prevData && prevData[0] ? parseInt(prevData[0], 10) : null;
        const prevDenied = prevData && prevData[1] ? parseInt(prevData[1], 10) : null;
        const currentDeltaAllowed = prevAllowed !== null ? Math.max(0, totalAllowed - prevAllowed) : 0;
        const currentDeltaDenied = prevDenied !== null ? Math.max(0, totalDenied - prevDenied) : 0;
        await redis_1.redis.hmset("rl:metrics:last_cumulative", "allowed", String(totalAllowed), "denied", String(totalDenied)).catch(() => { });
        const timestamp = Math.floor(Date.now() / 1000);
        const snapshot = { timestamp, allowed: currentDeltaAllowed, denied: currentDeltaDenied };
        await redis_1.redis.lpush("rl:metrics:timeline", JSON.stringify(snapshot)).catch(() => { });
        await redis_1.redis.ltrim("rl:metrics:timeline", 0, 29).catch(() => { });
        const rawTimeline = await redis_1.redis.lrange("rl:metrics:timeline", 0, -1).catch(() => []);
        const timeline = rawTimeline.map((item) => {
            const parsed = typeof item === "string" ? JSON.parse(item) : item;
            let timeVal;
            if (typeof parsed.timestamp === "number") {
                timeVal = parsed.timestamp;
            }
            else {
                const parsedInt = parseInt(parsed.timestamp, 10);
                timeVal = !isNaN(parsedInt) && String(parsedInt) === String(parsed.timestamp)
                    ? parsedInt
                    : Math.floor(Date.now() / 1000);
            }
            const displayTime = new Date(timeVal * 1000).toLocaleTimeString("en-US", {
                hour12: false,
                timeZone: "UTC",
            });
            return {
                timestamp: displayTime,
                allowed: parsed.allowed,
                denied: parsed.denied,
            };
        }).reverse();
        // Return payload conforming 100% to camelCase specification contract
        res.status(200).json({
            totalAllowed: totalAllowed ?? 0,
            totalDenied: totalDenied ?? 0,
            activeRules: activeRules ?? 0,
            topThrottled: topThrottled ?? [],
            timeline,
        });
    }
    catch (err) {
        // GLOBAL ABSOLUTE CATCH GUARD — return 200 with zeroed values instead of 500
        logger_1.logger.error({ err }, "Failed to aggregate stats, returning fallback statistics");
        res.status(200).json({
            totalAllowed: 0,
            totalDenied: 0,
            activeRules: 0,
            topThrottled: [],
            timeline: [],
        });
    }
});
exports.default = router;
//# sourceMappingURL=stats.js.map
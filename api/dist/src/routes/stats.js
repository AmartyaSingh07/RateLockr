"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const redis_1 = require("../store/redis");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../lib/logger");
// =============================================================================
// GET /stats — Global Telemetry Aggregator
// =============================================================================
// Reads lifetime counters (stats:allow:*, stats:deny:*) for totals and
// per-client data. Reads time-bucket keys (rl:metrics:bucket:<sec>) written
// by the middleware on every request for the timeline — so the chart shows
// real traffic, not a poll-frequency artifact.
//
// Protected by admin API key middleware.
// =============================================================================
/**
 * Normalises a single pipeline result across Redis driver formats.
 *
 * ioredis  → pipeline.exec() yields [Error|null, value] per command
 * Upstash  → pipeline.exec() yields the raw value directly
 *
 * Returns the unwrapped value, or null if nothing was stored.
 */
function unwrapPipeline(result) {
    if (result === null || result === undefined)
        return null;
    if (Array.isArray(result) &&
        result.length === 2 &&
        (result[0] === null || result[0] instanceof Error)) {
        // ioredis-style tuple: [error, value]
        return (result[1] ?? null);
    }
    // Upstash-style: raw value
    return result;
}
const router = (0, express_1.Router)();
router.use(auth_1.requireAdmin);
/**
 * Scan Redis for all keys matching a pattern without blocking the event loop.
 */
async function scanKeys(pattern) {
    try {
        const keys = [];
        let cursor = "0";
        do {
            const result = await redis_1.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            if (!result || !Array.isArray(result))
                break;
            const [nextCursor, batch] = result;
            cursor = nextCursor || "0";
            if (batch && Array.isArray(batch))
                keys.push(...batch);
            else
                break;
        } while (cursor !== "0");
        return keys;
    }
    catch (err) {
        logger_1.logger.error({ err, pattern }, "Error scanning keys from Redis");
        return [];
    }
}
// ---------------------------------------------------------------------------
// buildTimeline
// ---------------------------------------------------------------------------
// Scans the rl:tsbkt:g:<field>:<sec> (global) or
// rl:tsbkt:<clientId>:<field>:<sec> (per-client) string keys written by the
// middleware and assembles them into a 30-point timeline ordered oldest→newest.
//
// Always returns exactly 30 data points covering the last 30 seconds.
// Seconds with no traffic are padded with zeros so Recharts always has
// enough points to draw visible line segments.
// ---------------------------------------------------------------------------
async function buildTimeline(clientId) {
    try {
        const nowSec = Math.floor(Date.now() / 1000);
        const timeline = [];
        const pipe = redis_1.redis.pipeline();
        const targetSeconds = [];
        // Predict and schedule exact string key reads for the last 30 seconds
        for (let i = 29; i >= 0; i--) {
            const sec = nowSec - i;
            targetSeconds.push(sec);
            const allowedKey = clientId
                ? `rl:tsbkt:${clientId}:allowed:${sec}`
                : `rl:tsbkt:g:allowed:${sec}`;
            const deniedKey = clientId
                ? `rl:tsbkt:${clientId}:denied:${sec}`
                : `rl:tsbkt:g:denied:${sec}`;
            pipe.get(allowedKey);
            pipe.get(deniedKey);
        }
        // Execute the single fast batch lookup
        const results = await pipe.exec();
        // Map raw primitive results directly into our padded time structures
        for (let i = 0; i < 30; i++) {
            const sec = targetSeconds[i];
            const allowedVal = parseInt(unwrapPipeline(results?.[i * 2]) ?? "0", 10) || 0;
            const deniedVal = parseInt(unwrapPipeline(results?.[i * 2 + 1]) ?? "0", 10) || 0;
            timeline.push({
                timestamp: new Date(sec * 1000).toLocaleTimeString("en-US", {
                    hour12: false,
                    timeZone: "UTC",
                }),
                allowed: allowedVal,
                denied: deniedVal,
            });
        }
        return timeline;
    }
    catch (err) {
        logger_1.logger.error({ err, clientId }, "Failed to build deterministic timeline from explicit secondary indices");
        return [];
    }
}
router.get("/", async (req, res) => {
    try {
        const clientId = (req.query.client_id || req.query.clientId);
        // ── Per-client stats path ────────────────────────────────────────────────
        if (clientId) {
            const [allowVal, denyVal, ruleCount] = await Promise.all([
                redis_1.redis.get(`stats:allow:${clientId}`).catch(() => null),
                redis_1.redis.get(`stats:deny:${clientId}`).catch(() => null),
                redis_1.redis.hlen(`rl:rules:${clientId}`).catch(() => 0),
            ]);
            const allowed = parseInt(allowVal ?? "0", 10) || 0;
            const denied = parseInt(denyVal ?? "0", 10) || 0;
            // Timeline is built from bucket keys — no delta math, no polling artifacts
            const timeline = await buildTimeline(clientId);
            res.status(200).json({
                totalAllowed: allowed,
                totalDenied: denied,
                activeRules: ruleCount,
                topThrottled: denied > 0 ? [clientId] : [],
                timeline,
            });
            return;
        }
        // ── Global stats path ────────────────────────────────────────────────────
        const [allowKeys, denyKeys, ruleKeys] = await Promise.all([
            scanKeys("stats:allow:*").catch(() => []),
            scanKeys("stats:deny:*").catch(() => []),
            scanKeys("rl:rules:*").catch(() => []),
        ]);
        // Extract unique client IDs from counter keys
        const clientIds = new Set();
        for (const key of allowKeys) {
            if (key.startsWith("stats:allow:"))
                clientIds.add(key.slice("stats:allow:".length));
        }
        for (const key of denyKeys) {
            if (key.startsWith("stats:deny:"))
                clientIds.add(key.slice("stats:deny:".length));
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
                const pipelineResults = await pipeline.exec() ?? [];
                for (let i = 0; i < clientList.length; i++) {
                    const allowVal = unwrapPipeline(pipelineResults[i * 2]);
                    const denyVal = unwrapPipeline(pipelineResults[i * 2 + 1]);
                    const allowed = parseInt(allowVal ?? "0", 10) || 0;
                    const denied = parseInt(denyVal ?? "0", 10) || 0;
                    totalAllowed += allowed;
                    totalDenied += denied;
                    clients.push({
                        clientId: clientList[i],
                        allowed,
                        denied,
                        denyRate: (allowed + denied) > 0 ? denied / (allowed + denied) : 0,
                    });
                }
            }
            catch (pipelineErr) {
                logger_1.logger.error({ pipelineErr }, "Error executing Redis statistics lookup pipeline");
            }
        }
        // Active rules count
        let activeRules = 0;
        if (ruleKeys.length > 0) {
            try {
                const rulesPipeline = redis_1.redis.pipeline();
                for (const key of ruleKeys)
                    rulesPipeline.hlen(key);
                const rulesResults = await rulesPipeline.exec() ?? [];
                for (const result of rulesResults) {
                    const countVal = unwrapPipeline(result) ?? 0;
                    activeRules += countVal;
                }
            }
            catch (rulesErr) {
                logger_1.logger.error({ rulesErr }, "Error executing rules check pipeline");
            }
        }
        // Top 5 violators
        const topThrottled = clients
            .filter((c) => c.denied > 0)
            .sort((a, b) => b.denied - a.denied)
            .slice(0, 5)
            .map((c) => c.clientId);
        // Timeline from bucket keys — accurate regardless of polling frequency
        const timeline = await buildTimeline();
        res.status(200).json({
            totalAllowed,
            totalDenied,
            activeRules,
            topThrottled,
            timeline,
        });
    }
    catch (err) {
        // Log the real error — do NOT silently return zeros, it hides bugs
        logger_1.logger.error({ err }, "Failed to aggregate stats");
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to retrieve statistics. Check service logs.",
        });
    }
});
exports.default = router;
//# sourceMappingURL=stats.js.map
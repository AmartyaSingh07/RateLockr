"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validate_1 = require("../middleware/validate");
const checkSchema_1 = require("../schemas/checkSchema");
const redis_1 = require("../store/redis");
const keys_1 = require("../lib/keys");
const tokenBucket_1 = require("../algorithms/tokenBucket");
const slidingWindow_1 = require("../algorithms/slidingWindow");
const fixedWindow_1 = require("../algorithms/fixedWindow");
const logger_1 = require("../lib/logger");
const metrics_1 = require("../metrics");
const router = (0, express_1.Router)();
const DEFAULT_RULE = {
    client_id: "global",
    endpoint: "global",
    limit: 100,
    window_seconds: 60,
    algorithm: "sliding_window"
};
router.post("/", (0, validate_1.validateBody)(checkSchema_1.checkSchema), async (req, res, next) => {
    try {
        const { client_id, endpoint, algorithm: requestedAlg } = req.body;
        let ruleDataRaw = null;
        try {
            const ruleKeyName = (0, keys_1.rulesKey)(client_id);
            ruleDataRaw = await redis_1.redis.hget(ruleKeyName, endpoint);
        }
        catch (err) {
            metrics_1.redisErrorsTotal.inc({ operation: "hget_rules" });
            logger_1.logger.error({ err, client_id, endpoint }, "Redis error fetching rules");
        }
        let rule = { ...DEFAULT_RULE, client_id, endpoint };
        if (ruleDataRaw) {
            try {
                rule = typeof ruleDataRaw === "string" ? JSON.parse(ruleDataRaw) : ruleDataRaw;
            }
            catch (err) {
                logger_1.logger.error({ err, client_id, endpoint }, "Failed to parse rule data from Redis");
            }
        }
        const algorithmToUse = requestedAlg || rule.algorithm;
        let allowed = true;
        let remaining = rule.limit;
        const nowMs = Date.now();
        // Start Prometheus duration timer
        const timer = metrics_1.checkDurationMs.startTimer({ algorithm: algorithmToUse });
        switch (algorithmToUse) {
            case "token_bucket": {
                const refillRate = Math.max(1, Math.floor(rule.limit / rule.window_seconds));
                const resTB = await (0, tokenBucket_1.checkTokenBucket)({
                    clientId: client_id,
                    endpoint,
                    capacity: rule.limit,
                    refillRate
                });
                allowed = resTB.allowed;
                remaining = resTB.remaining;
                break;
            }
            case "sliding_window": {
                const resSW = await (0, slidingWindow_1.checkSlidingWindow)({
                    clientId: client_id,
                    endpoint,
                    capacity: rule.limit,
                    windowSizeMs: rule.window_seconds * 1000
                });
                allowed = resSW.allowed;
                remaining = resSW.remaining;
                break;
            }
            case "fixed_window": {
                const resFW = await (0, fixedWindow_1.checkFixedWindow)({
                    clientId: client_id,
                    endpoint,
                    capacity: rule.limit,
                    windowSizeSeconds: rule.window_seconds
                });
                allowed = resFW.allowed;
                remaining = resFW.remaining;
                break;
            }
            default: {
                timer(); // Stop timer before early exit
                logger_1.logger.error({ algorithm: algorithmToUse }, "Unknown algorithm mapped");
                res.status(400).json({ error: "Unknown algorithm" });
                return;
            }
        }
        // Stop duration timer
        timer();
        // If remaining is -1, it means the wrapper failed-open natively due to Redis connection drop
        if (remaining === -1) {
            metrics_1.redisErrorsTotal.inc({ operation: "eval_lua" });
        }
        const resetTimeUnix = Math.ceil((nowMs + (rule.window_seconds * 1000)) / 1000);
        res.setHeader("X-RateLimit-Limit", String(rule.limit));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
        res.setHeader("X-RateLimit-Reset", String(resetTimeUnix));
        if (!allowed) {
            res.setHeader("Retry-After", String(rule.window_seconds));
            metrics_1.checkRequestsTotal.inc({ algorithm: algorithmToUse, client_id, result: "deny" });
            redis_1.redis.incr((0, keys_1.statsDenyKey)(client_id)).catch((err) => {
                logger_1.logger.error({ err }, "Failed to increment deny stat");
            });
            res.status(429).json({ error: "Too Many Requests" });
            return;
        }
        metrics_1.checkRequestsTotal.inc({ algorithm: algorithmToUse, client_id, result: "allow" });
        redis_1.redis.incr((0, keys_1.statsAllowKey)(client_id)).catch((err) => {
            logger_1.logger.error({ err }, "Failed to increment allow stat");
        });
        res.status(200).json({ allowed: true });
    }
    catch (err) {
        metrics_1.redisErrorsTotal.inc({ operation: "check_route_exception" });
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=check.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiterMiddleware = void 0;
const redis_1 = require("../store/redis");
const keys_1 = require("../lib/keys");
const tokenBucket_1 = require("../algorithms/tokenBucket");
const slidingWindow_1 = require("../algorithms/slidingWindow");
const fixedWindow_1 = require("../algorithms/fixedWindow");
const logger_1 = require("../lib/logger");
const metrics_1 = require("../metrics");
// Hardcoded fallback rules matching the seeded configurations
const PATH_DEFAULT_RULES = {
    "/api/v1/checkout": { limit: 100, window_seconds: 60, algorithm: "token_bucket" },
    "/api/v1/analytics": { limit: 5, window_seconds: 30, algorithm: "token_bucket" },
    "/api/v1/search": { limit: 3, window_seconds: 10, algorithm: "sliding_window" },
    "/api/v1/login": { limit: 5, window_seconds: 60, algorithm: "sliding_window" },
    "/api/v1/webhooks": { limit: 50, window_seconds: 10, algorithm: "fixed_window" },
};
const PATH_CLIENT_MAPPING = {
    "/api/v1/checkout": "user_premium_zone",
    "/api/v1/analytics": "user_free_tier",
    "/api/v1/search": "anonymous_crawler",
    "/api/v1/login": "public_auth_gateway",
    "/api/v1/webhooks": "stripe_webhook_syncer",
};
const rateLimiterMiddleware = async (req, res, next) => {
    try {
        const endpoint = req.originalUrl.split('?')[0];
        // Resolve Client ID from headers, query, body, or path mapping
        const resolvedClientId = req.headers["x-client-id"] ||
            req.headers["X-Client-ID"] ||
            req.query["clientId"] ||
            req.query["client_id"] ||
            (req.body && req.body.clientId) ||
            (req.body && req.body.client_id) ||
            PATH_CLIENT_MAPPING[endpoint] ||
            "global";
        if (resolvedClientId === "global") {
            console.log(`[WARN] Unmatched rate limiting pipeline execution: falling back to 'global' client ID for endpoint: ${endpoint}`);
            logger_1.logger.warn({ endpoint }, "⚠️ Unmatched rate limiting pipeline execution - falling back to 'global' client ID");
        }
        let ruleDataRaw = null;
        try {
            const ruleKeyName = (0, keys_1.rulesKey)(resolvedClientId);
            ruleDataRaw = await redis_1.redis.hget(ruleKeyName, endpoint);
        }
        catch (err) {
            metrics_1.redisErrorsTotal.inc({ operation: "middleware_hget" });
            logger_1.logger.error({ err, resolvedClientId, endpoint }, "Middleware Redis error fetching rule");
        }
        // Default config fallback
        const pathDefaults = PATH_DEFAULT_RULES[endpoint] || {
            limit: 100,
            window_seconds: 60,
            algorithm: "sliding_window"
        };
        let rule = {
            client_id: resolvedClientId,
            endpoint,
            ...pathDefaults
        };
        if (ruleDataRaw) {
            try {
                const parsed = typeof ruleDataRaw === "string" ? JSON.parse(ruleDataRaw) : ruleDataRaw;
                rule = { ...rule, ...parsed };
            }
            catch (err) {
                logger_1.logger.error({ err, resolvedClientId, endpoint }, "Middleware failed to parse rule");
            }
        }
        let allowed = true;
        let remaining = rule.limit;
        const nowMs = Date.now();
        switch (rule.algorithm) {
            case "token_bucket": {
                const refillRate = Math.max(1, Math.floor(rule.limit / rule.window_seconds));
                const resTB = await (0, tokenBucket_1.checkTokenBucket)({
                    clientId: resolvedClientId,
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
                    clientId: resolvedClientId,
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
                    clientId: resolvedClientId,
                    endpoint,
                    capacity: rule.limit,
                    windowSizeSeconds: rule.window_seconds
                });
                allowed = resFW.allowed;
                remaining = resFW.remaining;
                break;
            }
            default: {
                logger_1.logger.error({ algorithm: rule.algorithm }, "Middleware unknown algorithm");
                next();
                return;
            }
        }
        const resetTimeUnix = Math.ceil((nowMs + (rule.window_seconds * 1000)) / 1000);
        res.setHeader("X-RateLimit-Limit", String(rule.limit));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
        res.setHeader("X-RateLimit-Reset", String(resetTimeUnix));
        if (!allowed) {
            res.setHeader("Retry-After", String(rule.window_seconds));
            metrics_1.checkRequestsTotal.inc({ algorithm: rule.algorithm, client_id: resolvedClientId, result: "deny" });
            redis_1.redis.incr((0, keys_1.statsDenyKey)(resolvedClientId)).catch((err) => {
                logger_1.logger.error({ err }, "Middleware failed to increment deny stat");
            });
            res.status(429).json({ error: "Too Many Requests" });
            return;
        }
        metrics_1.checkRequestsTotal.inc({ algorithm: rule.algorithm, client_id: resolvedClientId, result: "allow" });
        redis_1.redis.incr((0, keys_1.statsAllowKey)(resolvedClientId)).catch((err) => {
            logger_1.logger.error({ err }, "Middleware failed to increment allow stat");
        });
        next();
    }
    catch (err) {
        logger_1.logger.error({ err }, "Middleware critical exception");
        next(err);
    }
};
exports.rateLimiterMiddleware = rateLimiterMiddleware;
//# sourceMappingURL=rateLimiter.js.map
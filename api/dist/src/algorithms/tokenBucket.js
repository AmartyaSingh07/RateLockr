"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTokenBucket = checkTokenBucket;
const redis_1 = require("../store/redis");
const logger_1 = require("../lib/logger");
const keys_1 = require("../lib/keys");
// =============================================================================
// Token Bucket — TypeScript Wrapper
// =============================================================================
// Calls the atomically registered `tokenBucket` Lua command loaded by the
// Day 2 boot-loader. The Lua script guarantees single-threaded execution
// inside Redis, eliminating all race conditions.
// =============================================================================
/**
 * Executes an atomic token bucket rate-limit check against Redis.
 *
 * @param params - Token bucket configuration and request context
 * @returns Decision object with `allowed` boolean and `remaining` token count
 *
 * @remarks
 * **Fail-open behaviour**: If Redis is unreachable or the Lua execution
 * throws, the request is ALLOWED and `remaining` is set to `-1` to signal
 * degraded mode to callers. This prevents a Redis outage from cascading
 * into a total traffic block on dependent services.
 */
async function checkTokenBucket(params) {
    const { clientId, endpoint, capacity, refillRate, cost = 1, nowMs = Date.now(), } = params;
    const key = (0, keys_1.tokenBucketKey)(clientId, endpoint);
    try {
        // The boot-loader registered `tokenBucket` via defineCommand().
        // ioredis doesn't expose dynamically-added commands in its type
        // definitions, so we use a safe type assertion here.
        const result = await redis_1.redis["tokenBucket"](key, String(capacity), String(refillRate), String(nowMs), String(cost));
        // ----- Defensive response parsing -----
        if (!Array.isArray(result) || result.length < 2) {
            logger_1.logger.error({ result, key }, "Unexpected response shape from tokenBucket Lua script");
            return { allowed: true, remaining: -1 };
        }
        const allowedRaw = Number(result[0]);
        const remainingRaw = Number(result[1]);
        if (Number.isNaN(allowedRaw) || Number.isNaN(remainingRaw)) {
            logger_1.logger.error({ result, key }, "Non-numeric values in tokenBucket Lua response");
            return { allowed: true, remaining: -1 };
        }
        return {
            allowed: allowedRaw === 1,
            remaining: remainingRaw,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message, key, clientId, endpoint }, "Token bucket check failed — failing open");
        // Fail-open: allow the request so dependent services don't crash
        return { allowed: true, remaining: -1 };
    }
}
//# sourceMappingURL=tokenBucket.js.map
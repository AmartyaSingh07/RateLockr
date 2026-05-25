"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSlidingWindow = checkSlidingWindow;
const redis_1 = require("../store/redis");
const logger_1 = require("../lib/logger");
const keys_1 = require("../lib/keys");
const crypto_1 = __importDefault(require("crypto"));
// =============================================================================
// Sliding Window Log — TypeScript Wrapper
// =============================================================================
// Calls the atomically registered `slidingWindow` Lua command loaded by the
// Day 2 boot-loader.
// =============================================================================
/**
 * Executes an atomic sliding window log rate-limit check against Redis.
 *
 * @param params - Sliding window configuration and request context
 * @returns Decision object with `allowed` boolean and `remaining` count
 *
 * @remarks
 * **Fail-open behaviour**: If Redis is unreachable or the Lua execution
 * throws, the request is ALLOWED and `remaining` is set to `-1` to signal
 * degraded mode to callers.
 */
async function checkSlidingWindow(params) {
    const { clientId, endpoint, capacity, windowSizeMs, nowMs = Date.now(), } = params;
    const key = (0, keys_1.slidingWindowKey)(clientId, endpoint);
    const uniqueId = crypto_1.default.randomUUID(); // Unique member for the ZSET
    try {
        const result = await redis_1.redis["slidingWindow"](key, String(capacity), String(windowSizeMs), String(nowMs), uniqueId);
        // ----- Defensive response parsing -----
        if (!Array.isArray(result) || result.length < 2) {
            logger_1.logger.error({ result, key }, "Unexpected response shape from slidingWindow Lua script");
            return { allowed: true, remaining: -1 };
        }
        const allowedRaw = Number(result[0]);
        const remainingRaw = Number(result[1]);
        if (Number.isNaN(allowedRaw) || Number.isNaN(remainingRaw)) {
            logger_1.logger.error({ result, key }, "Non-numeric values in slidingWindow Lua response");
            return { allowed: true, remaining: -1 };
        }
        return {
            allowed: allowedRaw === 1,
            remaining: remainingRaw,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message, key, clientId, endpoint }, "Sliding window check failed — failing open");
        return { allowed: true, remaining: -1 };
    }
}
//# sourceMappingURL=slidingWindow.js.map
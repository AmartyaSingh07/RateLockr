"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFixedWindow = checkFixedWindow;
const redis_1 = require("../store/redis");
const logger_1 = require("../lib/logger");
const keys_1 = require("../lib/keys");
// =============================================================================
// Fixed Window Counter — TypeScript Wrapper
// =============================================================================
/**
 * Executes an atomic fixed window counter rate-limit check against Redis.
 *
 * @param params - Fixed window configuration and request context
 * @returns Decision object with `allowed` boolean and `remaining` count
 *
 * @remarks
 * **Fail-open behaviour**: If Redis is unreachable or the Lua execution
 * throws, the request is ALLOWED and `remaining` is set to `-1` to signal
 * degraded mode to callers.
 */
async function checkFixedWindow(params) {
    const { clientId, endpoint, capacity, windowSizeSeconds, cost = 1, } = params;
    const key = (0, keys_1.fixedWindowKey)(clientId, endpoint);
    try {
        const result = await redis_1.redis["fixedWindow"](key, String(capacity), String(windowSizeSeconds), String(cost));
        // ----- Defensive response parsing -----
        if (!Array.isArray(result) || result.length < 2) {
            logger_1.logger.error({ result, key }, "Unexpected response shape from fixedWindow Lua script");
            return { allowed: true, remaining: -1 };
        }
        const allowedRaw = Number(result[0]);
        const remainingRaw = Number(result[1]);
        if (Number.isNaN(allowedRaw) || Number.isNaN(remainingRaw)) {
            logger_1.logger.error({ result, key }, "Non-numeric values in fixedWindow Lua response");
            return { allowed: true, remaining: -1 };
        }
        return {
            allowed: allowedRaw === 1,
            remaining: remainingRaw,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message, key, clientId, endpoint }, "Fixed window check failed — failing open");
        return { allowed: true, remaining: -1 };
    }
}
//# sourceMappingURL=fixedWindow.js.map
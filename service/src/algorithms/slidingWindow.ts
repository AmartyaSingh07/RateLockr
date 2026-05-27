import { redis } from "../store/redis";
import { logger } from "../lib/logger";
import { slidingWindowKey } from "../lib/keys";
import crypto from "crypto";

// =============================================================================
// Types
// =============================================================================

export interface SlidingWindowParams {
  /** Unique identifier for the client (e.g. API key, user ID, IP) */
  clientId: string;
  /** Target endpoint or resource path */
  endpoint: string;
  /** Maximum requests allowed in the window */
  capacity: number;
  /** Window size in milliseconds */
  windowSizeMs: number;
  /** Override timestamp in ms for deterministic testing (default: Date.now()) */
  nowMs?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed (true) or denied (false) */
  allowed: boolean;
  /** Number of slots remaining in the window after this request */
  remaining: number;
}

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
export async function checkSlidingWindow(
  params: SlidingWindowParams
): Promise<RateLimitResult> {
  const {
    clientId,
    endpoint,
    capacity,
    windowSizeMs,
    nowMs = Date.now(),
  } = params;

  const key = slidingWindowKey(clientId, endpoint);
  const uniqueId = crypto.randomUUID(); // Unique member for the ZSET

  try {
    const result: unknown = await (
      redis as unknown as Record<string, (...args: string[]) => Promise<unknown>>
    )["slidingWindow"]!(
      key,
      String(capacity),
      String(windowSizeMs),
      String(nowMs),
      uniqueId
    );

    logger.info(
      { key, capacity, windowSizeMs, nowMs, rawResult: JSON.stringify(result) },
      "slidingWindow Lua eval raw response"
    );

    // ----- Defensive response parsing -----
    if (!Array.isArray(result) || result.length < 2) {
      logger.error(
        { result, key },
        "Unexpected response shape from slidingWindow Lua script"
      );
      return { allowed: true, remaining: -1 };
    }

    const allowedRaw = Number(result[0]);
    const remainingRaw = Number(result[1]);

    logger.info(
      { allowedRaw, remainingRaw, key },
      "slidingWindow parsed decision"
    );

    if (Number.isNaN(allowedRaw) || Number.isNaN(remainingRaw)) {
      logger.error(
        { result, key },
        "Non-numeric values in slidingWindow Lua response"
      );
      return { allowed: true, remaining: -1 };
    }

    const allowed = allowedRaw === 1 && remainingRaw >= 0;

    return {
      allowed,
      remaining: remainingRaw,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, key, clientId, endpoint },
      "Sliding window check failed — failing open"
    );
    return { allowed: true, remaining: -1 };
  }
}

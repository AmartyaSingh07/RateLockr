import { redis } from "../store/redis";
import { logger } from "../lib/logger";
import { fixedWindowKey } from "../lib/keys";

// =============================================================================
// Types
// =============================================================================

export interface FixedWindowParams {
  /** Unique identifier for the client (e.g. API key, user ID, IP) */
  clientId: string;
  /** Target endpoint or resource path */
  endpoint: string;
  /** Maximum requests allowed in the window */
  capacity: number;
  /** Window size in seconds */
  windowSizeSeconds: number;
  /** Tokens consumed per request (default: 1) */
  cost?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed (true) or denied (false) */
  allowed: boolean;
  /** Number of requests remaining in the window after this request */
  remaining: number;
}

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
export async function checkFixedWindow(
  params: FixedWindowParams
): Promise<RateLimitResult> {
  const {
    clientId,
    endpoint,
    capacity,
    windowSizeSeconds,
    cost = 1,
  } = params;

  const key = fixedWindowKey(clientId, endpoint);

  try {
    const result: unknown = await (
      redis as unknown as Record<string, (...args: string[]) => Promise<unknown>>
    )["fixedWindow"]!(
      key,
      String(capacity),
      String(windowSizeSeconds),
      String(cost)
    );

    // ----- Defensive response parsing -----
    if (!Array.isArray(result) || result.length < 2) {
      logger.error(
        { result, key },
        "Unexpected response shape from fixedWindow Lua script"
      );
      return { allowed: true, remaining: -1 };
    }

    const allowedRaw = Number(result[0]);
    const remainingRaw = Number(result[1]);

    if (Number.isNaN(allowedRaw) || Number.isNaN(remainingRaw)) {
      logger.error(
        { result, key },
        "Non-numeric values in fixedWindow Lua response"
      );
      return { allowed: true, remaining: -1 };
    }

    return {
      allowed: allowedRaw === 1,
      remaining: remainingRaw,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, key, clientId, endpoint },
      "Fixed window check failed — failing open"
    );
    return { allowed: true, remaining: -1 };
  }
}

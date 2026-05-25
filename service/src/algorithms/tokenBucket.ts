import { redis } from "../store/redis";
import { logger } from "../lib/logger";
import { tokenBucketKey } from "../lib/keys";

// =============================================================================
// Types
// =============================================================================

export interface TokenBucketParams {
  /** Unique identifier for the client (e.g. API key, user ID, IP) */
  clientId: string;
  /** Target endpoint or resource path */
  endpoint: string;
  /** Maximum tokens the bucket can hold */
  capacity: number;
  /** Tokens restored per second */
  refillRate: number;
  /** Tokens consumed per request (default: 1) */
  cost?: number;
  /** Override timestamp in ms for deterministic testing (default: Date.now()) */
  nowMs?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed (true) or denied (false) */
  allowed: boolean;
  /** Number of tokens remaining in the bucket after this request */
  remaining: number;
}

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
export async function checkTokenBucket(
  params: TokenBucketParams
): Promise<RateLimitResult> {
  const {
    clientId,
    endpoint,
    capacity,
    refillRate,
    cost = 1,
    nowMs = Date.now(),
  } = params;

  const key = tokenBucketKey(clientId, endpoint);

  try {
    // The boot-loader registered `tokenBucket` via defineCommand().
    // ioredis doesn't expose dynamically-added commands in its type
    // definitions, so we use a safe type assertion here.
    const result: unknown = await (
      redis as unknown as Record<string, (...args: string[]) => Promise<unknown>>
    )["tokenBucket"]!(
      key,
      String(capacity),
      String(refillRate),
      String(nowMs),
      String(cost)
    );

    // ----- Defensive response parsing -----
    if (!Array.isArray(result) || result.length < 2) {
      logger.error(
        { result, key },
        "Unexpected response shape from tokenBucket Lua script"
      );
      return { allowed: true, remaining: -1 };
    }

    const allowedRaw = Number(result[0]);
    const remainingRaw = Number(result[1]);

    if (Number.isNaN(allowedRaw) || Number.isNaN(remainingRaw)) {
      logger.error(
        { result, key },
        "Non-numeric values in tokenBucket Lua response"
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
      "Token bucket check failed — failing open"
    );
    // Fail-open: allow the request so dependent services don't crash
    return { allowed: true, remaining: -1 };
  }
}

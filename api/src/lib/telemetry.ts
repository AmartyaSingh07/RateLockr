import { redis } from "../store/redis";
import { statsAllowKey, statsDenyKey } from "./keys";
import { logger } from "./logger";

// Time-bucket TTL. The stats endpoint only reads the last 30 seconds, so we
// keep 30s + 15s of buffer for clock skew and polling jitter. If the chart
// window is ever extended, bump this to (window + 15)s.
const BUCKET_TTL_SECONDS = 45;

/**
 * Records a single rate-limit decision event.
 * Increments the lifetime counter and writes a 1-second time-bucket key.
 * Called after every allow/deny decision in both check.ts and rateLimiter.ts.
 */
export async function recordEvent(clientId: string, allowed: boolean): Promise<void> {
  // 1. Lifetime counter
  const counterKey = allowed ? statsAllowKey(clientId) : statsDenyKey(clientId);
  try {
    await redis.incr(counterKey);
  } catch (err) {
    logger.error({ err, clientId, allowed }, "Failed to increment lifetime counter");
  }

  // 2. Per-second time buckets
  const nowSec = Math.floor(Date.now() / 1000);
  const field = allowed ? "allowed" : "denied";
  const globalKey = `rl:tsbkt:g:${field}:${nowSec}`;
  const clientKey = `rl:tsbkt:${clientId}:${field}:${nowSec}`;

  try {
    const pipe = redis.pipeline();
    pipe.incr(globalKey);
    pipe.incr(clientKey);
    pipe.expire(globalKey, BUCKET_TTL_SECONDS);
    pipe.expire(clientKey, BUCKET_TTL_SECONDS);
    await pipe.exec();
  } catch (err) {
    logger.error({ err, clientId, nowSec }, "Pipeline bucket write failed — falling back to direct writes");
    redis.incr(globalKey).then(() => redis.expire(globalKey, BUCKET_TTL_SECONDS)).catch(() => {});
    redis.incr(clientKey).then(() => redis.expire(clientKey, BUCKET_TTL_SECONDS)).catch(() => {});
  }
}

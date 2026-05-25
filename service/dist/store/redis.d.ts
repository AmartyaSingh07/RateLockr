import Redis from "ioredis";
export declare const redis: Redis;
/**
 * Scan Redis for rate-limiting transactional keys and evict keys that:
 * - Have no expiration set (TTL is -1)
 * - Are empty ZSETs (sliding window log) or empty HASHes (token bucket)
 */
export declare function evictExpiredOrStaleKeys(): Promise<number>;
/**
 * Starts the recurring 60s background eviction routine.
 */
export declare function startEvictionRoutine(intervalMs?: number): void;
/**
 * Stops the recurring background eviction routine.
 */
export declare function stopEvictionRoutine(): void;
/**
 * Connect to Redis and boot-load all Lua scripts.
 *
 * Must be called once at application startup. If Redis is unreachable,
 * the error is logged but NOT re-thrown — the service starts in degraded
 * mode (fail-open principle). ioredis will continue reconnecting in the
 * background via retryStrategy.
 */
export declare function initRedis(): Promise<void>;
/**
 * Graceful shutdown — close the Redis connection cleanly.
 * Call this in your process SIGTERM/SIGINT handler.
 */
export declare function shutdownRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map
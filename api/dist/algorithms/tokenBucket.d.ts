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
export declare function checkTokenBucket(params: TokenBucketParams): Promise<RateLimitResult>;
//# sourceMappingURL=tokenBucket.d.ts.map
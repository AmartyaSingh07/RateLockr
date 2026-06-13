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
export declare function checkSlidingWindow(params: SlidingWindowParams): Promise<RateLimitResult>;
//# sourceMappingURL=slidingWindow.d.ts.map
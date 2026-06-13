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
export declare function checkFixedWindow(params: FixedWindowParams): Promise<RateLimitResult>;
//# sourceMappingURL=fixedWindow.d.ts.map
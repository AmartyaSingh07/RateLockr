/**
 * Builds a namespaced Redis key for the Token Bucket algorithm.
 * Pattern: `rl:tb:{clientId}:{endpoint}`
 */
export declare function tokenBucketKey(clientId: string, endpoint: string): string;
/**
 * Builds a namespaced Redis key for the Sliding Window Log algorithm.
 * Pattern: `rl:sw:{clientId}:{endpoint}`
 */
export declare function slidingWindowKey(clientId: string, endpoint: string): string;
/**
 * Builds a namespaced Redis key for the Fixed Window Counter algorithm.
 * Pattern: `rl:fw:{clientId}:{endpoint}`
 */
export declare function fixedWindowKey(clientId: string, endpoint: string): string;
/**
 * Builds a Redis key for storing a client's rules in a Hash.
 * Pattern: `rl:rules:{clientId}`
 */
export declare function rulesKey(clientId: string): string;
/**
 * Builds a Redis key for incrementing cumulative allow stats.
 * Pattern: `stats:allow:{clientId}`
 */
export declare function statsAllowKey(clientId: string): string;
/**
 * Builds a Redis key for incrementing cumulative deny stats.
 * Pattern: `stats:deny:{clientId}`
 */
export declare function statsDenyKey(clientId: string): string;
//# sourceMappingURL=keys.d.ts.map
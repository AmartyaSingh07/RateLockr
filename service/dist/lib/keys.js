"use strict";
// =============================================================================
// Centralized Redis Key Builder
// =============================================================================
// All Redis key patterns live here. This prevents typos, ensures consistent
// namespacing, and makes key pattern changes a single-file edit.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenBucketKey = tokenBucketKey;
exports.slidingWindowKey = slidingWindowKey;
exports.fixedWindowKey = fixedWindowKey;
exports.rulesKey = rulesKey;
exports.statsAllowKey = statsAllowKey;
exports.statsDenyKey = statsDenyKey;
/**
 * Builds a namespaced Redis key for the Token Bucket algorithm.
 * Pattern: `rl:tb:{clientId}:{endpoint}`
 */
function tokenBucketKey(clientId, endpoint) {
    return `rl:tb:${clientId}:${endpoint}`;
}
/**
 * Builds a namespaced Redis key for the Sliding Window Log algorithm.
 * Pattern: `rl:sw:{clientId}:{endpoint}`
 */
function slidingWindowKey(clientId, endpoint) {
    return `rl:sw:${clientId}:${endpoint}`;
}
/**
 * Builds a namespaced Redis key for the Fixed Window Counter algorithm.
 * Pattern: `rl:fw:{clientId}:{endpoint}`
 */
function fixedWindowKey(clientId, endpoint) {
    return `rl:fw:${clientId}:${endpoint}`;
}
/**
 * Builds a Redis key for storing a client's rules in a Hash.
 * Pattern: `rl:rules:{clientId}`
 */
function rulesKey(clientId) {
    return `rl:rules:${clientId}`;
}
/**
 * Builds a Redis key for incrementing cumulative allow stats.
 * Pattern: `stats:allow:{clientId}`
 */
function statsAllowKey(clientId) {
    return `stats:allow:${clientId}`;
}
/**
 * Builds a Redis key for incrementing cumulative deny stats.
 * Pattern: `stats:deny:{clientId}`
 */
function statsDenyKey(clientId) {
    return `stats:deny:${clientId}`;
}
//# sourceMappingURL=keys.js.map
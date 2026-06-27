// =============================================================================
// Centralized Redis Key Builder
// =============================================================================
// All Redis key patterns live here. This prevents typos, ensures consistent
// namespacing, and makes key pattern changes a single-file edit.
// =============================================================================

/**
 * Strips characters that would corrupt the Redis key namespace.
 * Colons are the namespace delimiter; spaces and wildcards break SCAN patterns.
 */
function sanitize(input: string): string {
  if (!input || input.trim() === "") {
    throw new Error(`Redis key segment cannot be empty (got: ${JSON.stringify(input)})`);
  }
  // Replace colons, spaces, wildcards, and null bytes with underscores
  return input.replace(/[:\s*?\x00]/g, "_");
}

/**
 * Builds a namespaced Redis key for the Token Bucket algorithm.
 * Pattern: `rl:tb:{clientId}:{endpoint}`
 */
export function tokenBucketKey(clientId: string, endpoint: string): string {
  return `rl:tb:${sanitize(clientId)}:${sanitize(endpoint)}`;
}

/**
 * Builds a namespaced Redis key for the Sliding Window Log algorithm.
 * Pattern: `rl:sw:{clientId}:{endpoint}`
 */
export function slidingWindowKey(clientId: string, endpoint: string): string {
  return `rl:sw:${sanitize(clientId)}:${sanitize(endpoint)}`;
}

/**
 * Builds a namespaced Redis key for the Fixed Window Counter algorithm.
 * Pattern: `rl:fw:{clientId}:{endpoint}`
 */
export function fixedWindowKey(clientId: string, endpoint: string): string {
  return `rl:fw:${sanitize(clientId)}:${sanitize(endpoint)}`;
}

/**
 * Builds a Redis key for storing a client's rules in a Hash.
 * Pattern: `rl:rules:{clientId}`
 */
export function rulesKey(clientId: string): string {
  return `rl:rules:${sanitize(clientId)}`;
}

/**
 * Builds a Redis key for incrementing cumulative allow stats.
 * Pattern: `stats:allow:{clientId}`
 */
export function statsAllowKey(clientId: string): string {
  return `stats:allow:${sanitize(clientId)}`;
}

/**
 * Builds a Redis key for incrementing cumulative deny stats.
 * Pattern: `stats:deny:{clientId}`
 */
export function statsDenyKey(clientId: string): string {
  return `stats:deny:${sanitize(clientId)}`;
}

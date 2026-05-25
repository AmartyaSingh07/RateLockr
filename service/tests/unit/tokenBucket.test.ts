// =============================================================================
// Token Bucket Algorithm — Unit Test Suite
// =============================================================================
// Tests the TypeScript wrapper against mocked Redis responses to verify:
//   1. Happy Path — fresh bucket allows and decrements correctly
//   2. Exhaustion — rapid requests drain the bucket to denial
//   3. Refill     — elapsed time replenishes tokens accurately
//   4. Fail-open  — Redis errors still allow traffic through
//   5. Defensive  — malformed Lua responses are handled safely
// =============================================================================

// ---------------------------------------------------------------------------
// Mock Setup — must be declared before any module imports
// ---------------------------------------------------------------------------

const mockTokenBucket = jest.fn();

jest.mock("../../src/store/redis", () => ({
  redis: {
    tokenBucket: mockTokenBucket,
    status: "ready",
  },
}));

jest.mock("../../src/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { checkTokenBucket } from "../../src/algorithms/tokenBucket";
import { logger } from "../../src/lib/logger";

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Token Bucket Algorithm", () => {
  const baseParams = {
    clientId: "user-alpha",
    endpoint: "/api/data",
    capacity: 10,
    refillRate: 2,
    nowMs: 1_700_000_000_000, // fixed timestamp for deterministic tests
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Test 1: Happy Path
  // =========================================================================
  describe("Happy Path — Fresh bucket allows requests", () => {
    it("should return allowed=true and correct remaining count on first request", async () => {
      // Lua returns: [1 (allowed), 9 (remaining after consuming 1 from 10)]
      mockTokenBucket.mockResolvedValueOnce([1, 9]);

      const result = await checkTokenBucket(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should build the correct Redis key pattern", async () => {
      mockTokenBucket.mockResolvedValueOnce([1, 9]);

      await checkTokenBucket(baseParams);

      expect(mockTokenBucket).toHaveBeenCalledWith(
        "rl:tb:user-alpha:/api/data", // key
        "10",                          // capacity
        "2",                           // refillRate
        "1700000000000",               // nowMs
        "1"                            // cost (default)
      );
    });

    it("should pass custom cost when specified", async () => {
      mockTokenBucket.mockResolvedValueOnce([1, 7]);

      const result = await checkTokenBucket({ ...baseParams, cost: 3 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
      expect(mockTokenBucket).toHaveBeenCalledWith(
        "rl:tb:user-alpha:/api/data",
        "10",
        "2",
        "1700000000000",
        "3" // custom cost
      );
    });

    it("should show decreasing remaining on successive allowed requests", async () => {
      mockTokenBucket
        .mockResolvedValueOnce([1, 9])
        .mockResolvedValueOnce([1, 8])
        .mockResolvedValueOnce([1, 7]);

      const r1 = await checkTokenBucket(baseParams);
      const r2 = await checkTokenBucket(baseParams);
      const r3 = await checkTokenBucket(baseParams);

      expect(r1).toEqual({ allowed: true, remaining: 9 });
      expect(r2).toEqual({ allowed: true, remaining: 8 });
      expect(r3).toEqual({ allowed: true, remaining: 7 });
    });
  });

  // =========================================================================
  // Test 2: Exhaustion Path
  // =========================================================================
  describe("Exhaustion — Rapid requests drain the bucket", () => {
    it("should deny when bucket is fully exhausted", async () => {
      mockTokenBucket.mockResolvedValueOnce([0, 0]);

      const result = await checkTokenBucket(baseParams);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should show the full drain sequence from capacity to denial", async () => {
      // Simulate a capacity-3 bucket being drained
      const smallBucket = { ...baseParams, capacity: 3, refillRate: 1 };

      mockTokenBucket
        .mockResolvedValueOnce([1, 2])  // request 1: allowed, 2 left
        .mockResolvedValueOnce([1, 1])  // request 2: allowed, 1 left
        .mockResolvedValueOnce([1, 0])  // request 3: allowed, 0 left
        .mockResolvedValueOnce([0, 0]); // request 4: DENIED

      const results = [];
      for (let i = 0; i < 4; i++) {
        results.push(await checkTokenBucket(smallBucket));
      }

      // First 3 requests pass
      expect(results[0]).toEqual({ allowed: true, remaining: 2 });
      expect(results[1]).toEqual({ allowed: true, remaining: 1 });
      expect(results[2]).toEqual({ allowed: true, remaining: 0 });
      // 4th request is denied
      expect(results[3]).toEqual({ allowed: false, remaining: 0 });
    });

    it("should deny when cost exceeds remaining tokens", async () => {
      // 2 tokens left, but request costs 5
      mockTokenBucket.mockResolvedValueOnce([0, 2]);

      const result = await checkTokenBucket({
        ...baseParams,
        cost: 5,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(2);
    });
  });

  // =========================================================================
  // Test 3: Refill Path
  // =========================================================================
  describe("Refill — Tokens replenish after elapsed time", () => {
    it("should show tokens restored after time window elapses", async () => {
      // Request at T=0: bucket is exhausted
      mockTokenBucket.mockResolvedValueOnce([0, 0]);

      const exhausted = await checkTokenBucket({
        ...baseParams,
        nowMs: 1_700_000_000_000,
      });
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.remaining).toBe(0);

      // Request at T+5s: refill_rate=2/s → 10 tokens refilled, capped at capacity=10
      // Lua computes: 0 + (5 * 2) = 10, min(10, 10) = 10, consume 1 → 9 remaining
      mockTokenBucket.mockResolvedValueOnce([1, 9]);

      const refilled = await checkTokenBucket({
        ...baseParams,
        nowMs: 1_700_000_005_000, // 5 seconds later
      });
      expect(refilled.allowed).toBe(true);
      expect(refilled.remaining).toBe(9);
    });

    it("should show partial refill for short elapsed windows", async () => {
      // Bucket had 0 tokens. 1 second passes at refill_rate=2 → 2 tokens added.
      // Consume 1 → 1 remaining.
      mockTokenBucket.mockResolvedValueOnce([1, 1]);

      const result = await checkTokenBucket({
        ...baseParams,
        nowMs: 1_700_000_001_000, // 1 second after exhaustion
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("should cap refilled tokens at max capacity", async () => {
      // Even after a very long wait, tokens should never exceed capacity.
      // Simulates: 0 + (3600 * 2) = 7200, min(7200, 10) = 10, consume 1 → 9
      mockTokenBucket.mockResolvedValueOnce([1, 9]);

      const result = await checkTokenBucket({
        ...baseParams,
        nowMs: 1_700_003_600_000, // 1 hour later
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      // Remaining should be capacity - cost, never more than capacity
      expect(result.remaining).toBeLessThanOrEqual(baseParams.capacity);
    });
  });

  // =========================================================================
  // Test 4: Fail-Open Resilience
  // =========================================================================
  describe("Fail-Open — Redis errors allow traffic through", () => {
    it("should return allowed=true when Redis throws a connection error", async () => {
      mockTokenBucket.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await checkTokenBucket(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: "ECONNREFUSED",
          key: "rl:tb:user-alpha:/api/data",
        }),
        expect.stringContaining("failing open")
      );
    });

    it("should return allowed=true when Redis times out", async () => {
      mockTokenBucket.mockRejectedValueOnce(new Error("Command timed out"));

      const result = await checkTokenBucket(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });
  });

  // =========================================================================
  // Test 5: Defensive Parsing
  // =========================================================================
  describe("Defensive Parsing — Handles malformed Lua responses", () => {
    it("should fail open on non-array response", async () => {
      mockTokenBucket.mockResolvedValueOnce("unexpected_string");

      const result = await checkTokenBucket(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ result: "unexpected_string" }),
        expect.stringContaining("Unexpected response shape")
      );
    });

    it("should fail open on empty array response", async () => {
      mockTokenBucket.mockResolvedValueOnce([]);

      const result = await checkTokenBucket(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });

    it("should fail open on null response", async () => {
      mockTokenBucket.mockResolvedValueOnce(null);

      const result = await checkTokenBucket(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
    });
  });
});

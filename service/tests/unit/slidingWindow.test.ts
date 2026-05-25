// =============================================================================
// Sliding Window Log Algorithm — Unit Test Suite
// =============================================================================

const mockSlidingWindow = jest.fn();

jest.mock("../../src/store/redis", () => ({
  redis: {
    slidingWindow: mockSlidingWindow,
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

import { checkSlidingWindow } from "../../src/algorithms/slidingWindow";
import { logger } from "../../src/lib/logger";
import crypto from "crypto";

describe("Sliding Window Algorithm", () => {
  const baseParams = {
    clientId: "user-alpha",
    endpoint: "/api/data",
    capacity: 10,
    windowSizeMs: 60000,
    nowMs: 1_700_000_000_000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Test 1: Happy Path
  // =========================================================================
  describe("Happy Path — Fresh window allows requests", () => {
    it("should return allowed=true and correct remaining count on first request", async () => {
      mockSlidingWindow.mockResolvedValueOnce([1, 9]);

      const result = await checkSlidingWindow(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should build the correct Redis key pattern and include crypto UUID", async () => {
      mockSlidingWindow.mockResolvedValueOnce([1, 9]);
      jest.spyOn(crypto, "randomUUID").mockReturnValueOnce("test-uuid-123");

      await checkSlidingWindow(baseParams);

      expect(mockSlidingWindow).toHaveBeenCalledWith(
        "rl:sw:user-alpha:/api/data",
        "10",
        "60000",
        "1700000000000",
        "test-uuid-123"
      );
    });

    it("should show decreasing remaining on successive allowed requests", async () => {
      mockSlidingWindow
        .mockResolvedValueOnce([1, 9])
        .mockResolvedValueOnce([1, 8])
        .mockResolvedValueOnce([1, 7]);

      const r1 = await checkSlidingWindow(baseParams);
      const r2 = await checkSlidingWindow(baseParams);
      const r3 = await checkSlidingWindow(baseParams);

      expect(r1).toEqual({ allowed: true, remaining: 9 });
      expect(r2).toEqual({ allowed: true, remaining: 8 });
      expect(r3).toEqual({ allowed: true, remaining: 7 });
    });
  });

  // =========================================================================
  // Test 2: Exhaustion Path
  // =========================================================================
  describe("Exhaustion — Rapid requests fill the window", () => {
    it("should deny when window is fully exhausted", async () => {
      mockSlidingWindow.mockResolvedValueOnce([0, 0]);

      const result = await checkSlidingWindow(baseParams);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  // =========================================================================
  // Test 3: Fail-Open Resilience
  // =========================================================================
  describe("Fail-Open — Redis errors allow traffic through", () => {
    it("should return allowed=true when Redis throws a connection error", async () => {
      mockSlidingWindow.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await checkSlidingWindow(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: "ECONNREFUSED",
          key: "rl:sw:user-alpha:/api/data",
        }),
        expect.stringContaining("failing open")
      );
    });
  });

  // =========================================================================
  // Test 4: Defensive Parsing
  // =========================================================================
  describe("Defensive Parsing — Handles malformed Lua responses", () => {
    it("should fail open on non-array response", async () => {
      mockSlidingWindow.mockResolvedValueOnce("unexpected_string");

      const result = await checkSlidingWindow(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ result: "unexpected_string" }),
        expect.stringContaining("Unexpected response shape")
      );
    });
  });
});

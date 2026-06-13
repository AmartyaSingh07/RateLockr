// =============================================================================
// Fixed Window Counter Algorithm — Unit Test Suite
// =============================================================================

const mockFixedWindow = jest.fn();

jest.mock("../../src/store/redis", () => ({
  redis: {
    fixedWindow: mockFixedWindow,
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

import { checkFixedWindow } from "../../src/algorithms/fixedWindow";
import { logger } from "../../src/lib/logger";

describe("Fixed Window Algorithm", () => {
  const baseParams = {
    clientId: "user-alpha",
    endpoint: "/api/data",
    capacity: 10,
    windowSizeSeconds: 60,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Test 1: Happy Path
  // =========================================================================
  describe("Happy Path — Fresh window allows requests", () => {
    it("should return allowed=true and correct remaining count on first request", async () => {
      mockFixedWindow.mockResolvedValueOnce([1, 9]);

      const result = await checkFixedWindow(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should build the correct Redis key pattern", async () => {
      mockFixedWindow.mockResolvedValueOnce([1, 9]);

      await checkFixedWindow(baseParams);

      expect(mockFixedWindow).toHaveBeenCalledWith(
        "rl:fw:user-alpha:/api/data",
        "10",
        "60",
        "1" // default cost
      );
    });

    it("should pass custom cost when specified", async () => {
      mockFixedWindow.mockResolvedValueOnce([1, 7]);

      const result = await checkFixedWindow({ ...baseParams, cost: 3 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
      expect(mockFixedWindow).toHaveBeenCalledWith(
        "rl:fw:user-alpha:/api/data",
        "10",
        "60",
        "3"
      );
    });

    it("should show decreasing remaining on successive allowed requests", async () => {
      mockFixedWindow
        .mockResolvedValueOnce([1, 9])
        .mockResolvedValueOnce([1, 8])
        .mockResolvedValueOnce([1, 7]);

      const r1 = await checkFixedWindow(baseParams);
      const r2 = await checkFixedWindow(baseParams);
      const r3 = await checkFixedWindow(baseParams);

      expect(r1).toEqual({ allowed: true, remaining: 9 });
      expect(r2).toEqual({ allowed: true, remaining: 8 });
      expect(r3).toEqual({ allowed: true, remaining: 7 });
    });
  });

  // =========================================================================
  // Test 2: Exhaustion Path
  // =========================================================================
  describe("Exhaustion — Rapid requests exhaust the counter", () => {
    it("should deny when window is fully exhausted", async () => {
      mockFixedWindow.mockResolvedValueOnce([0, 0]);

      const result = await checkFixedWindow(baseParams);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  // =========================================================================
  // Test 3: Fail-Open Resilience
  // =========================================================================
  describe("Fail-Open — Redis errors allow traffic through", () => {
    it("should return allowed=true when Redis throws a connection error", async () => {
      mockFixedWindow.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await checkFixedWindow(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: "ECONNREFUSED",
          key: "rl:fw:user-alpha:/api/data",
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
      mockFixedWindow.mockResolvedValueOnce("unexpected_string");

      const result = await checkFixedWindow(baseParams);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ result: "unexpected_string" }),
        expect.stringContaining("Unexpected response shape")
      );
    });
  });
});

import request from "supertest";
import express from "express";
import statsRouter from "../../src/routes/stats";

// Mock requireAdmin middleware
jest.mock("../../src/middleware/auth", () => ({
  requireAdmin: (req: any, res: any, next: any) => next(),
}));

const mockPipelineExec = jest.fn();

jest.mock("../../src/store/redis", () => {
  return {
    redis: {
      pipeline: () => ({
        get: jest.fn().mockReturnThis(),
        hlen: jest.fn().mockReturnThis(),
        exec: mockPipelineExec,
      }),
      scan: jest.fn(),
      get: jest.fn(),
      hlen: jest.fn(),
      status: "ready",
    },
    // scanKeys now lives in the redis module (deduplicated from the route).
    scanKeys: jest.fn().mockResolvedValue([]),
  };
});

import { redis } from "../../src/store/redis";

jest.mock("../../src/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use("/api/stats", statsRouter);

describe("GET /api/stats - Telemetry Stats Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return aggregated stats and timeline correctly parsed from Redis pipeline", async () => {
    (redis.scan as jest.Mock).mockResolvedValue([ "0", [] ]);

    // For timeline: 30 elements, each with allowed and denied command results in pipeline.
    // Under ioredis, exec returns tuples [error, value].
    const pipelineResults: Array<[null, string]> = [];
    for (let i = 0; i < 30; i++) {
      pipelineResults.push([null, String(i + 1)]); // allowed count
      pipelineResults.push([null, String((i + 1) * 2)]); // denied count
    }
    mockPipelineExec.mockResolvedValueOnce(pipelineResults);

    const response = await request(app)
      .get("/api/stats")
      .expect(200);

    expect(response.body).toHaveProperty("totalAllowed", 0);
    expect(response.body).toHaveProperty("totalDenied", 0);
    expect(response.body).toHaveProperty("activeRules", 0);
    expect(response.body.timeline).toHaveLength(30);

    // Verify that the allowed and denied values in the timeline are parsed correctly and not 0.
    expect(response.body.timeline[0].allowed).toBe(1);
    expect(response.body.timeline[0].denied).toBe(2);
    expect(response.body.timeline[29].allowed).toBe(30);
    expect(response.body.timeline[29].denied).toBe(60);
  });
});

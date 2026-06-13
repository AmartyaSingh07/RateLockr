// =============================================================================
// Rate Limit Key Eviction Routine — Unit Test Suite
// =============================================================================

const mockScan = jest.fn();
const mockTtl = jest.fn();
const mockType = jest.fn();
const mockZcard = jest.fn();
const mockHlen = jest.fn();
const mockDel = jest.fn();
const mockPipelineExec = jest.fn();
const mockPipeline = jest.fn().mockReturnValue({
  ttl: jest.fn().mockReturnThis(),
  type: jest.fn().mockReturnThis(),
  object: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  exec: mockPipelineExec,
});

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => {
    return {
      scan: mockScan,
      ttl: mockTtl,
      type: mockType,
      zcard: mockZcard,
      hlen: mockHlen,
      del: mockDel,
      pipeline: mockPipeline,
      status: "ready",
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      defineCommand: jest.fn(),
    };
  });
});

jest.mock("../../src/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { evictExpiredOrStaleKeys } from "../../src/store/redis";

describe("Rate Limit Key Eviction Routine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should do nothing if no keys are found", async () => {
    mockScan.mockResolvedValue(["0", []]);

    const evicted = await evictExpiredOrStaleKeys();

    expect(evicted).toBe(0);
  });

  it("should evict keys that have no remaining TTL (TTL = -1)", async () => {
    // Mock SCAN returning keys for each pattern (rl:tb:*, rl:sw:*, rl:fw:*)
    // Since we scan 3 patterns for transaction keys + 4 patterns for stats keys:
    mockScan
      .mockResolvedValueOnce(["0", ["rl:tb:client1:/endpoint1"]]) // for rl:tb:*
      .mockResolvedValueOnce(["0", []])                          // for rl:sw:*
      .mockResolvedValueOnce(["0", []])                          // for rl:fw:*
      .mockResolvedValueOnce(["0", []])                          // stats patterns
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []]);

    // Mock pipeline execution for TTL and TYPE
    mockPipelineExec
      .mockResolvedValueOnce([
        [null, -1],      // TTL for key
        [null, "hash"]   // TYPE for key
      ])
      .mockResolvedValueOnce([]); // for DEL execution

    const evictedCount = await evictExpiredOrStaleKeys();

    expect(evictedCount).toBe(1);
    expect(mockPipeline).toHaveBeenCalled();
  });

  it("should evict empty ZSET (sliding window) keys", async () => {
    mockScan
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", ["rl:sw:client1:/endpoint2"]])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []]);

    mockPipelineExec
      .mockResolvedValueOnce([
        [null, 30],      // TTL is valid (30s remaining)
        [null, "zset"]   // Type is zset
      ])
      .mockResolvedValueOnce([]); // for DEL

    // ZCARD mock to return 0 elements in ZSET
    mockZcard.mockResolvedValueOnce(0);

    const evictedCount = await evictExpiredOrStaleKeys();

    expect(evictedCount).toBe(1);
    expect(mockZcard).toHaveBeenCalledWith("rl:sw:client1:/endpoint2");
  });

  it("should evict empty HASH (token bucket) keys", async () => {
    mockScan
      .mockResolvedValueOnce(["0", ["rl:tb:client1:/endpoint3"]])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []]);

    mockPipelineExec
      .mockResolvedValueOnce([
        [null, 60],      // TTL is valid (60s remaining)
        [null, "hash"]   // Type is hash
      ])
      .mockResolvedValueOnce([]); // for DEL

    // HLEN mock to return 0 fields
    mockHlen.mockResolvedValueOnce(0);

    const evictedCount = await evictExpiredOrStaleKeys();

    expect(evictedCount).toBe(1);
    expect(mockHlen).toHaveBeenCalledWith("rl:tb:client1:/endpoint3");
  });

  it("should not evict keys with valid TTL and non-empty sizes", async () => {
    mockScan
      .mockResolvedValueOnce(["0", ["rl:tb:client1:/endpoint3"]])
      .mockResolvedValueOnce(["0", ["rl:sw:client1:/endpoint2"]])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []])
      .mockResolvedValueOnce(["0", []]);

    mockPipelineExec.mockResolvedValueOnce([
      [null, 60],      // TB TTL
      [null, "hash"],  // TB TYPE
      [null, 30],      // SW TTL
      [null, "zset"]   // SW TYPE
    ]);

    mockHlen.mockResolvedValueOnce(2); // TB has 2 fields (tokens, last_refill)
    mockZcard.mockResolvedValueOnce(5); // SW has 5 entries

    const evictedCount = await evictExpiredOrStaleKeys();

    expect(evictedCount).toBe(0);
  });

  it("should evict un-expiring client stats and metrics keys that are idle for more than 5 minutes", async () => {
    // 3 patterns for rate limit keys -> return []
    mockScan.mockResolvedValueOnce(["0", []]);
    mockScan.mockResolvedValueOnce(["0", []]);
    mockScan.mockResolvedValueOnce(["0", []]);

    // 4 patterns for stats keys -> return one stats key for stats:allow:*
    mockScan.mockResolvedValueOnce(["0", ["stats:allow:client-idle-1"]]);
    mockScan.mockResolvedValueOnce(["0", []]);
    mockScan.mockResolvedValueOnce(["0", []]);
    mockScan.mockResolvedValueOnce(["0", []]);

    // Pipeline exec for OBJECT IDLETIME returns idle time > 300 (e.g. 450)
    mockPipelineExec
      .mockResolvedValueOnce([
        [null, 450] // OBJECT IDLETIME return val
      ])
      .mockResolvedValueOnce([]); // for DEL

    const evictedCount = await evictExpiredOrStaleKeys();

    expect(evictedCount).toBe(1);
  });
});

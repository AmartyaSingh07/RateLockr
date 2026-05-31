import request from "supertest";
import { app } from "../../src/app";
import { redis as redisClient, initRedis } from "../../src/store/redis";
import { rulesKey } from "../../src/lib/keys";

describe("High-Concurrency Atomicity Test", () => {
  const TEST_CLIENT_ID = "race-condition-client";
  const TEST_ENDPOINT = "/api/race";
  const LIMIT = 10;
  const WINDOW_SECONDS = 60;

  beforeAll(async () => {
    // Initialize our ioredis client instance and invoke dynamic Lua boot-loader
    await initRedis();

    // Cleanly flush any existing client states
    await redisClient.del(`rl:sw:${TEST_CLIENT_ID}:${TEST_ENDPOINT}`);
    await redisClient.del(`stats:allow:${TEST_CLIENT_ID}`);
    await redisClient.del(`stats:deny:${TEST_CLIENT_ID}`);

    // Provision a custom rules Hash using the centralized key system
    const key = rulesKey(TEST_CLIENT_ID);
    const ruleStr = JSON.stringify({
      client_id: TEST_CLIENT_ID,
      endpoint: TEST_ENDPOINT,
      limit: LIMIT,
      window_seconds: WINDOW_SECONDS,
      algorithm: "sliding_window"
    });

    await redisClient.hset(key, TEST_ENDPOINT, ruleStr);
  });

  afterAll(async () => {
    // Teardown the specific keys used in this integration test
    await redisClient.del(`rl:sw:${TEST_CLIENT_ID}:${TEST_ENDPOINT}`);
    await redisClient.hdel(rulesKey(TEST_CLIENT_ID), TEST_ENDPOINT);

    // Cleanly sever the database connection pool so Jest can natively exit without hanging
    await redisClient.quit();
  });

  it("should enforce exactly 10 allows and 10 denies under simultaneous race conditions", async () => {
    const TOTAL_REQUESTS = 20;

    // Create an array of 20 un-awaited Supertest POST requests
    const promises = Array.from({ length: TOTAL_REQUESTS }).map(() => {
      return request(app)
        .post("/api/check")
        .send({
          client_id: TEST_CLIENT_ID,
          endpoint: TEST_ENDPOINT
        });
    });

    // Fire them all exactly simultaneously using Promise.all
    const responses = await Promise.all(promises);

    let allowedCount = 0;
    let deniedCount = 0;

    responses.forEach(res => {
      if (res.status === 200) {
        allowedCount++;
        expect(res.body.allowed).toBe(true);
      } else if (res.status === 429) {
        deniedCount++;
        expect(res.body.error).toBe("Too Many Requests");
      }
    });

    // Core Atomicity Assertions!
    expect(allowedCount).toBe(10);
    expect(deniedCount).toBe(10);
  });
});
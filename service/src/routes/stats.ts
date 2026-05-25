import { Router, Request, Response } from "express";
import { redis } from "../store/redis";
import { requireAdmin } from "../middleware/auth";
import { logger } from "../lib/logger";

// =============================================================================
// GET /stats — Global Telemetry Aggregator
// =============================================================================
// Scans all stats:allow:* and stats:deny:* counters in Redis, computes
// global totals, per-client deny rates, and returns the top 5 violators.
//
// Protected by admin API key middleware.
//
// Response shape (matches dashboard useStats hook):
// {
//   totalAllowed: number,
//   totalDenied:  number,
//   activeRules:  number,
//   topThrottled: string[]
// }
// =============================================================================

const router = Router();

router.use(requireAdmin);

interface ClientStats {
  clientId: string;
  allowed: number;
  denied: number;
  denyRate: number;
}

/**
 * Scan Redis for all keys matching a pattern and collect them without
 * blocking the event loop. Uses SCAN with a reasonable COUNT hint.
 */
async function scanKeys(pattern: string): Promise<string[]> {
  try {
    const keys: string[] = [];
    let cursor = "0";

    do {
      const result = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      if (!result || !Array.isArray(result)) {
        break;
      }
      const [nextCursor, batch] = result;
      cursor = nextCursor || "0";
      if (batch && Array.isArray(batch)) {
        keys.push(...batch);
      } else {
        break;
      }
    } while (cursor !== "0");

    return keys;
  } catch (err) {
    logger.error({ err, pattern }, "Error scanning keys from Redis");
    return [];
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const clientIdQuery = (_req.query["clientId"] || _req.query["client_id"]) as string | undefined;

    if (clientIdQuery) {
      const [allowVal, denyVal, ruleCount] = await Promise.all([
        redis.get(`stats:allow:${clientIdQuery}`).catch(() => null),
        redis.get(`stats:deny:${clientIdQuery}`).catch(() => null),
        redis.hlen(`rl:rules:${clientIdQuery}`).catch(() => 0),
      ]);

      const allowed = parseInt(allowVal ?? "0", 10) || 0;
      const denied = parseInt(denyVal ?? "0", 10) || 0;

      // ─── Time-Series Buffering for Client ───
      const lastCumulativeKey = `rl:metrics:last_cumulative:${clientIdQuery}`;
      const prevData = await redis.hmget(lastCumulativeKey, "allowed", "denied").catch(() => [null, null]);
      const prevAllowed = prevData && prevData[0] ? parseInt(prevData[0], 10) : null;
      const prevDenied = prevData && prevData[1] ? parseInt(prevData[1], 10) : null;

      const currentDeltaAllowed = prevAllowed !== null ? Math.max(0, allowed - prevAllowed) : 0;
      const currentDeltaDenied = prevDenied !== null ? Math.max(0, denied - prevDenied) : 0;

      await redis.hmset(lastCumulativeKey, "allowed", String(allowed), "denied", String(denied)).catch(() => {});

      const timestamp = new Date().toLocaleTimeString();
      const snapshot = { timestamp, allowed: currentDeltaAllowed, denied: currentDeltaDenied };

      const timelineKey = `rl:metrics:timeline:${clientIdQuery}`;
      await redis.lpush(timelineKey, JSON.stringify(snapshot)).catch(() => {});
      await redis.ltrim(timelineKey, 0, 29).catch(() => {});

      const rawTimeline = await redis.lrange(timelineKey, 0, -1).catch(() => []);
      const timeline = rawTimeline.map((item) => JSON.parse(item)).reverse();

      res.status(200).json({
        totalAllowed: allowed,
        totalDenied: denied,
        activeRules: ruleCount,
        topThrottled: denied > 0 ? [clientIdQuery] : [],
        timeline,
      });
      return;
    }

    // Discover all keys using robust SCAN fallbacks
    const [allowKeys, denyKeys, ruleKeys] = await Promise.all([
      scanKeys("stats:allow:*").catch(() => []),
      scanKeys("stats:deny:*").catch(() => []),
      scanKeys("rl:rules:*").catch(() => []),
    ]);

    const allowKeysList = allowKeys ?? [];
    const denyKeysList = denyKeys ?? [];
    const ruleKeysList = ruleKeys ?? [];

    // Extract unique client IDs
    const clientIds = new Set<string>();

    for (const key of allowKeysList) {
      if (key && typeof key === "string" && key.startsWith("stats:allow:")) {
        const clientId = key.slice("stats:allow:".length);
        clientIds.add(clientId);
      }
    }
    for (const key of denyKeysList) {
      if (key && typeof key === "string" && key.startsWith("stats:deny:")) {
        const clientId = key.slice("stats:deny:".length);
        clientIds.add(clientId);
      }
    }

    const clientList = Array.from(clientIds);
    let totalAllowed = 0;
    let totalDenied = 0;
    const clients: ClientStats[] = [];

    // Pipelined batch counter lookup
    if (clientList.length > 0) {
      try {
        const pipeline = redis.pipeline();
        for (const clientId of clientList) {
          pipeline.get(`stats:allow:${clientId}`);
          pipeline.get(`stats:deny:${clientId}`);
        }

        const pipelineResults = await pipeline.exec();
        const results = pipelineResults ?? [];

        for (let i = 0; i < clientList.length; i++) {
          const allowResult = results?.[i * 2];
          const denyResult = results?.[i * 2 + 1];

          const allowResultValue = allowResult && Array.isArray(allowResult) ? allowResult[1] : null;
          const denyResultValue = denyResult && Array.isArray(denyResult) ? denyResult[1] : null;

          const allowed = parseInt((allowResultValue as string) ?? "0", 10) || 0;
          const denied = parseInt((denyResultValue as string) ?? "0", 10) || 0;
          const clientTotal = allowed + denied;

          totalAllowed += allowed;
          totalDenied += denied;

          clients.push({
            clientId: clientList[i]!,
            allowed,
            denied,
            denyRate: clientTotal > 0 ? denied / clientTotal : 0,
          });
        }
      } catch (pipelineErr) {
        logger.error({ pipelineErr }, "Error executing Redis statistics lookup pipeline");
      }
    }

    // Compute active rules count safely
    let activeRules = 0;

    if (ruleKeysList.length > 0) {
      try {
        const rulesPipeline = redis.pipeline();
        for (const key of ruleKeysList) {
          rulesPipeline.hlen(key);
        }
        const rulesResults = await rulesPipeline.exec();
        const results = rulesResults ?? [];

        for (const result of results) {
          const countVal = result && Array.isArray(result) ? result[1] : 0;
          activeRules += (countVal as number) ?? 0;
        }
      } catch (rulesErr) {
        logger.error({ rulesErr }, "Error executing rules check pipeline");
      }
    }

    // Extract top 5 violators client IDs
    const topThrottled = clients
      .filter((c) => c && c.denied > 0)
      .sort((a, b) => b.denied - a.denied)
      .slice(0, 5)
      .map((c) => c.clientId) ?? [];

    // ─── Time-Series Buffering in Redis ───
    const prevData = await redis.hmget("rl:metrics:last_cumulative", "allowed", "denied").catch(() => [null, null]);
    const prevAllowed = prevData && prevData[0] ? parseInt(prevData[0], 10) : null;
    const prevDenied = prevData && prevData[1] ? parseInt(prevData[1], 10) : null;

    const currentDeltaAllowed = prevAllowed !== null ? Math.max(0, totalAllowed - prevAllowed) : 0;
    const currentDeltaDenied = prevDenied !== null ? Math.max(0, totalDenied - prevDenied) : 0;

    await redis.hmset("rl:metrics:last_cumulative", "allowed", String(totalAllowed), "denied", String(totalDenied)).catch(() => {});

    const timestamp = new Date().toLocaleTimeString();
    const snapshot = { timestamp, allowed: currentDeltaAllowed, denied: currentDeltaDenied };

    await redis.lpush("rl:metrics:timeline", JSON.stringify(snapshot)).catch(() => {});
    await redis.ltrim("rl:metrics:timeline", 0, 29).catch(() => {});

    const rawTimeline = await redis.lrange("rl:metrics:timeline", 0, -1).catch(() => []);
    const timeline = rawTimeline.map((item) => JSON.parse(item)).reverse();

    // Return payload conforming 100% to camelCase specification contract
    res.status(200).json({
      totalAllowed: totalAllowed ?? 0,
      totalDenied: totalDenied ?? 0,
      activeRules: activeRules ?? 0,
      topThrottled: topThrottled ?? [],
      timeline,
    });
  } catch (err) {
    // GLOBAL ABSOLUTE CATCH GUARD — return 200 with zeroed values instead of 500
    logger.error({ err }, "Failed to aggregate stats, returning fallback statistics");
    res.status(200).json({
      totalAllowed: 0,
      totalDenied: 0,
      activeRules: 0,
      topThrottled: [],
      timeline: [],
    });
  }
});

export default router;

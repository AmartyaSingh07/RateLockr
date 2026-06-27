import { Router, Request, Response } from "express";
import { redis, scanKeys } from "../store/redis";
import { requireAdmin } from "../middleware/auth";
import { logger } from "../lib/logger";

// =============================================================================
// GET /stats — Global Telemetry Aggregator
// =============================================================================
// Reads lifetime counters (stats:allow:*, stats:deny:*) for totals and
// per-client data. Reads time-bucket keys (rl:metrics:bucket:<sec>) written
// by the middleware on every request for the timeline — so the chart shows
// real traffic, not a poll-frequency artifact.
//
// Protected by admin API key middleware.
// =============================================================================

/**
 * Normalises a single pipeline result across Redis driver formats.
 *
 * ioredis  → pipeline.exec() yields [Error|null, value] per command
 * Upstash  → pipeline.exec() yields the raw value directly
 *
 * Returns the unwrapped value, or null if nothing was stored.
 */
function unwrapPipeline<T>(result: unknown): T | null {
  if (result === null || result === undefined) return null;
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    (result[0] === null || result[0] instanceof Error)
  ) {
    // ioredis-style tuple: [error, value]
    return (result[1] ?? null) as T | null;
  }
  // Upstash-style: raw value
  return result as T;
}

const router = Router();

router.use(requireAdmin);

interface ClientStats {
  clientId: string;
  allowed: number;
  denied: number;
  denyRate: number;
}

// ---------------------------------------------------------------------------
// buildTimeline
// ---------------------------------------------------------------------------
// Scans the rl:tsbkt:g:<field>:<sec> (global) or
// rl:tsbkt:<clientId>:<field>:<sec> (per-client) string keys written by the
// middleware and assembles them into a 30-point timeline ordered oldest→newest.
//
// Always returns exactly 30 data points covering the last 30 seconds.
// Seconds with no traffic are padded with zeros so Recharts always has
// enough points to draw visible line segments.
// ---------------------------------------------------------------------------
async function buildTimeline(
  clientId?: string
): Promise<Array<{ timestamp: string; allowed: number; denied: number }>> {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const timeline: Array<{ timestamp: string; allowed: number; denied: number }> = [];
    
    const pipe = redis.pipeline();
    const targetSeconds: number[] = [];

    // Predict and schedule exact string key reads for the last 30 seconds
    for (let i = 29; i >= 0; i--) {
      const sec = nowSec - i;
      targetSeconds.push(sec);

      const allowedKey = clientId
        ? `rl:tsbkt:${clientId}:allowed:${sec}`
        : `rl:tsbkt:g:allowed:${sec}`;
      const deniedKey = clientId
        ? `rl:tsbkt:${clientId}:denied:${sec}`
        : `rl:tsbkt:g:denied:${sec}`;

      pipe.get(allowedKey);
      pipe.get(deniedKey);
    }

    // Execute the single fast batch lookup
    const results = await pipe.exec();

    // Map raw primitive results directly into our padded time structures
    for (let i = 0; i < 30; i++) {
      const sec = targetSeconds[i]!;
      const allowedVal = parseInt(unwrapPipeline<string>(results?.[i * 2]) ?? "0", 10) || 0;
      const deniedVal = parseInt(unwrapPipeline<string>(results?.[i * 2 + 1]) ?? "0", 10) || 0;

      timeline.push({
        timestamp: new Date(sec * 1000).toLocaleTimeString("en-US", {
          hour12: false,
          timeZone: "UTC",
        }),
        allowed: allowedVal,
        denied: deniedVal,
      });
    }

    return timeline;
  } catch (err) {
    logger.error({ err, clientId }, "Failed to build deterministic timeline from explicit secondary indices");
    return [];
  }
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id || req.query.clientId) as string | undefined;

    // ── Per-client stats path ────────────────────────────────────────────────
    if (clientId) {
      const [allowVal, denyVal, ruleCount] = await Promise.all([
        redis.get(`stats:allow:${clientId}`).catch(() => null),
        redis.get(`stats:deny:${clientId}`).catch(() => null),
        redis.hlen(`rl:rules:${clientId}`).catch(() => 0),
      ]);

      const allowed = parseInt(allowVal ?? "0", 10) || 0;
      const denied  = parseInt(denyVal  ?? "0", 10) || 0;

      // Timeline is built from bucket keys — no delta math, no polling artifacts
      const timeline = await buildTimeline(clientId);

      res.status(200).json({
        totalAllowed: allowed,
        totalDenied: denied,
        activeRules: ruleCount,
        topThrottled: denied > 0 ? [clientId] : [],
        timeline,
      });
      return;
    }

    // ── Global stats path ────────────────────────────────────────────────────
    const [allowKeys, denyKeys, ruleKeys] = await Promise.all([
      scanKeys("stats:allow:*").catch(() => [] as string[]),
      scanKeys("stats:deny:*").catch(()  => [] as string[]),
      scanKeys("rl:rules:*").catch(()    => [] as string[]),
    ]);

    // Extract unique client IDs from counter keys
    const clientIds = new Set<string>();
    for (const key of allowKeys) {
      if (key.startsWith("stats:allow:")) clientIds.add(key.slice("stats:allow:".length));
    }
    for (const key of denyKeys) {
      if (key.startsWith("stats:deny:"))  clientIds.add(key.slice("stats:deny:".length));
    }

    const clientList = Array.from(clientIds);
    let totalAllowed = 0;
    let totalDenied  = 0;
    const clients: ClientStats[] = [];

    // Pipelined batch counter lookup
    if (clientList.length > 0) {
      try {
        const pipeline = redis.pipeline();
        for (const clientId of clientList) {
          pipeline.get(`stats:allow:${clientId}`);
          pipeline.get(`stats:deny:${clientId}`);
        }
        const pipelineResults = await pipeline.exec() ?? [];

        for (let i = 0; i < clientList.length; i++) {
          const allowVal = unwrapPipeline<string>(pipelineResults[i * 2]);
          const denyVal  = unwrapPipeline<string>(pipelineResults[i * 2 + 1]);

          const allowed = parseInt((allowVal as string) ?? "0", 10) || 0;
          const denied  = parseInt((denyVal  as string) ?? "0", 10) || 0;
          totalAllowed += allowed;
          totalDenied  += denied;

          clients.push({
            clientId: clientList[i]!,
            allowed,
            denied,
            denyRate: (allowed + denied) > 0 ? denied / (allowed + denied) : 0,
          });
        }
      } catch (pipelineErr) {
        logger.error({ pipelineErr }, "Error executing Redis statistics lookup pipeline");
      }
    }

    // Active rules count
    let activeRules = 0;
    if (ruleKeys.length > 0) {
      try {
        const rulesPipeline = redis.pipeline();
        for (const key of ruleKeys) rulesPipeline.hlen(key);
        const rulesResults = await rulesPipeline.exec() ?? [];
        for (const result of rulesResults) {
          const countVal = unwrapPipeline<number>(result) ?? 0;
          activeRules += countVal;
        }
      } catch (rulesErr) {
        logger.error({ rulesErr }, "Error executing rules check pipeline");
      }
    }

    // Top 5 violators
    const topThrottled = clients
      .filter((c) => c.denied > 0)
      .sort((a, b) => b.denied - a.denied)
      .slice(0, 5)
      .map((c) => c.clientId);

    // Timeline from bucket keys — accurate regardless of polling frequency
    const timeline = await buildTimeline();

    res.status(200).json({
      totalAllowed,
      totalDenied,
      activeRules,
      topThrottled,
      timeline,
    });
  } catch (err) {
    // Log the real error — do NOT silently return zeros, it hides bugs
    logger.error({ err }, "Failed to aggregate stats");
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to retrieve statistics. Check service logs.",
    });
  }
});

export default router;

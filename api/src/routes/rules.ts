import { Router } from "express";
import { validateBody } from "../middleware/validate";
import { ruleSchema, RuleRequest } from "../schemas/ruleSchema";
import { redis, scanKeys } from "../store/redis";
import { rulesKey } from "../lib/keys";
import { requireAdmin } from "../middleware/auth";
import { logger } from "../lib/logger";

const router = Router();

// Secure all rule routes with admin API key middleware
router.use(requireAdmin);

// ─────────────────────────────────────────────────────────────────────────────
// GET / — Fetch ALL rules across ALL clients (for the admin dashboard table)
// ─────────────────────────────────────────────────────────────────────────────
// Scans rl:rules:* keys, pipelines hgetall for each, and flattens into a
// single array. Returns { rules: [...] } with a safe empty fallback.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  try {
    const ruleKeys = await scanKeys("rl:rules:*");

    if (ruleKeys.length === 0) {
      res.status(200).json({ rules: [] });
      return;
    }

    // Pipeline hgetall for every discovered rule hash
    const pipeline = redis.pipeline();
    for (const key of ruleKeys) {
      pipeline.hgetall(key);
    }
    const pipelineResults = await pipeline.exec();
    const results = pipelineResults ?? [];

    const rules: unknown[] = [];
    for (const result of results) {
      if (!result || !Array.isArray(result)) continue;
      const [err, hash] = result;
      if (err || !hash || typeof hash !== "object") continue;

      // Each hash field value is a JSON-stringified rule object
      for (const raw of Object.values(hash as Record<string, string>)) {
        try {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (parsed && parsed.client_id && parsed.endpoint) {
            rules.push(parsed);
          }
        } catch {
          // Skip malformed entries
        }
      }
    }

    res.status(200).json({ rules });
  } catch (err) {
    logger.error({ err }, "Failed to fetch all rules, returning fallback");
    res.status(200).json({ rules: [] });
  }
});
router.post("/", validateBody(ruleSchema), async (req, res, next) => {
  try {
    const rule = req.body as RuleRequest;
    const key = rulesKey(rule.client_id);
    
    await redis.hset(key, rule.endpoint, JSON.stringify(rule));
    
    logger.info({ rule }, "Rule created or updated");
    res.status(201).json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

// Fetch all rules mapped to a specific client ID
router.get("/:client_id", async (req, res, next) => {
  try {
    const { client_id } = req.params;
    const key = rulesKey(client_id);
    
    const rulesRaw = (await redis.hgetall(key)) ?? {};
    
    const rules = Object.values(rulesRaw).map(raw => {
      try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    res.status(200).json({ rules });
  } catch (err) {
    next(err);
  }
});

// Delete a specific endpoint rule for a client
router.delete("/:client_id/:endpoint", async (req, res, next) => {
  try {
    const { client_id, endpoint } = req.params;
    const key = rulesKey(client_id);
    
    const result = await redis.hdel(key, endpoint);
    
    if (result === 0) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    
    logger.info({ client_id, endpoint }, "Rule deleted");
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

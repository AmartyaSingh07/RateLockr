import { Router } from "express";
import { validateBody } from "../middleware/validate";
import { checkSchema, CheckRequest } from "../schemas/checkSchema";
import { redis } from "../store/redis";
import { rulesKey, statsAllowKey, statsDenyKey } from "../lib/keys";
import { checkTokenBucket } from "../algorithms/tokenBucket";
import { checkSlidingWindow } from "../algorithms/slidingWindow";
import { checkFixedWindow } from "../algorithms/fixedWindow";
import { logger } from "../lib/logger";
import { RuleRequest } from "../schemas/ruleSchema";
import { checkRequestsTotal, checkDurationMs, redisErrorsTotal } from "../metrics";

const router = Router();

const DEFAULT_RULE: RuleRequest = {
  client_id: "global",
  endpoint: "global",
  limit: 100,
  window_seconds: 60,
  algorithm: "sliding_window"
};

router.post("/", validateBody(checkSchema), async (req, res, next) => {
  try {
    const { client_id, endpoint, algorithm: requestedAlg } = req.body as CheckRequest;
    
    let ruleDataRaw = null;
    try {
      const ruleKeyName = rulesKey(client_id);
      ruleDataRaw = await redis.hget(ruleKeyName, endpoint);
    } catch (err) {
      redisErrorsTotal.inc({ operation: "hget_rules" });
      logger.error({ err, client_id, endpoint }, "Redis error fetching rules");
    }

    let rule: RuleRequest = { ...DEFAULT_RULE, client_id, endpoint };
    
    if (ruleDataRaw) {
      try {
        rule = typeof ruleDataRaw === "string" ? JSON.parse(ruleDataRaw) : ruleDataRaw;
      } catch (err) {
        logger.error({ err, client_id, endpoint }, "Failed to parse rule data from Redis");
      }
    }

    const algorithmToUse = requestedAlg || rule.algorithm;
    let allowed = true;
    let remaining = rule.limit;
    
    const nowMs = Date.now();

    // Start Prometheus duration timer
    const timer = checkDurationMs.startTimer({ algorithm: algorithmToUse });

    switch (algorithmToUse) {
      case "token_bucket": {
        const refillRate = Math.max(1, Math.floor(rule.limit / rule.window_seconds));
        const resTB = await checkTokenBucket({
          clientId: client_id,
          endpoint,
          capacity: rule.limit,
          refillRate
        });
        allowed = resTB.allowed;
        remaining = resTB.remaining;
        break;
      }
      case "sliding_window": {
        const resSW = await checkSlidingWindow({
          clientId: client_id,
          endpoint,
          capacity: rule.limit,
          windowSizeMs: rule.window_seconds * 1000
        });
        allowed = resSW.allowed;
        remaining = resSW.remaining;
        break;
      }
      case "fixed_window": {
        const resFW = await checkFixedWindow({
          clientId: client_id,
          endpoint,
          capacity: rule.limit,
          windowSizeSeconds: rule.window_seconds
        });
        allowed = resFW.allowed;
        remaining = resFW.remaining;
        break;
      }
      default: {
        timer(); // Stop timer before early exit
        logger.error({ algorithm: algorithmToUse }, "Unknown algorithm mapped");
        res.status(400).json({ error: "Unknown algorithm" });
        return;
      }
    }

    // Stop duration timer
    timer();

    // If remaining is -1, it means the wrapper failed-open natively due to Redis connection drop
    if (remaining === -1) {
      redisErrorsTotal.inc({ operation: "eval_lua" });
    }

    const resetTimeUnix = Math.ceil((nowMs + (rule.window_seconds * 1000)) / 1000);

    res.setHeader("X-RateLimit-Limit", String(rule.limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("X-RateLimit-Reset", String(resetTimeUnix));

    if (!allowed) {
      res.setHeader("Retry-After", String(rule.window_seconds));
      
      checkRequestsTotal.inc({ algorithm: algorithmToUse, client_id, result: "deny" });
      
      redis.incr(statsDenyKey(client_id)).catch((err) => {
        logger.error({ err }, "Failed to increment deny stat");
      });

      res.status(429).json({ error: "Too Many Requests" });
      return;
    }

    checkRequestsTotal.inc({ algorithm: algorithmToUse, client_id, result: "allow" });
    
    redis.incr(statsAllowKey(client_id)).catch((err) => {
      logger.error({ err }, "Failed to increment allow stat");
    });

    res.status(200).json({ allowed: true });

  } catch (err) {
    redisErrorsTotal.inc({ operation: "check_route_exception" });
    next(err);
  }
});

export default router;

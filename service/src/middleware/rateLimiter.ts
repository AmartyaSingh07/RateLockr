import { Request, Response, NextFunction } from "express";
import { redis } from "../store/redis";
import { rulesKey, statsAllowKey, statsDenyKey } from "../lib/keys";
import { checkTokenBucket } from "../algorithms/tokenBucket";
import { checkSlidingWindow } from "../algorithms/slidingWindow";
import { checkFixedWindow } from "../algorithms/fixedWindow";
import { logger } from "../lib/logger";
import { checkRequestsTotal, redisErrorsTotal } from "../metrics";
import { RuleRequest } from "../schemas/ruleSchema";

// Hardcoded fallback rules matching the seeded configurations
const PATH_DEFAULT_RULES: Record<string, Omit<RuleRequest, "client_id" | "endpoint">> = {
  "/api/v1/checkout":  { limit: 100, window_seconds: 60, algorithm: "token_bucket" },
  "/api/v1/analytics": { limit: 5,   window_seconds: 30, algorithm: "token_bucket" },
  "/api/v1/search":    { limit: 3,   window_seconds: 10, algorithm: "sliding_window" },
  "/api/v1/login":     { limit: 5,   window_seconds: 60, algorithm: "sliding_window" },
  "/api/v1/webhooks":  { limit: 50,  window_seconds: 10, algorithm: "fixed_window" },
};

const PATH_CLIENT_MAPPING: Record<string, string> = {
  "/api/v1/checkout":  "user_premium_zone",
  "/api/v1/analytics": "user_free_tier",
  "/api/v1/search":    "anonymous_crawler",
  "/api/v1/login":     "public_auth_gateway",
  "/api/v1/webhooks":  "stripe_webhook_syncer",
};

export const rateLimiterMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    // Extract the fully-qualified absolute path, stripping query strings
    const endpoint = req.originalUrl.split('?')[0] as string;
    
    // Resolve Client ID — case-insensitive header extraction with Array guard
    const rawClientId = req.headers["x-client-id"] || req.headers["X-Client-ID"];
    const resolvedClientId = 
      (Array.isArray(rawClientId) ? rawClientId[0] : (rawClientId as string)) ||
      (req.query["clientId"] as string) ||
      (req.query["client_id"] as string) ||
      (req.body && req.body.clientId) ||
      (req.body && req.body.client_id) ||
      PATH_CLIENT_MAPPING[endpoint] ||
      "global";

    logger.info({ endpoint, resolvedClientId }, "Rate limiter intercepting request");

    if (resolvedClientId === "global") {
      console.log(`[WARN] Unmatched rate limiting pipeline execution: falling back to 'global' client ID for endpoint: ${endpoint}`);
      logger.warn({ endpoint }, "⚠️ Unmatched rate limiting pipeline execution - falling back to 'global' client ID");
    }

    let ruleDataRaw = null;
    try {
      const ruleKeyName = rulesKey(resolvedClientId);
      logger.info({ ruleKeyName, hashField: endpoint }, "Redis HGET lookup parameters");
      ruleDataRaw = await redis.hget(ruleKeyName, endpoint);
      logger.info({ ruleKeyName, hashField: endpoint, found: ruleDataRaw !== null }, "Redis HGET lookup result");
    } catch (err) {
      redisErrorsTotal.inc({ operation: "middleware_hget" });
      logger.error({ err, resolvedClientId, endpoint }, "Middleware Redis error fetching rule");
    }

    // Default config fallback
    const pathDefaults = PATH_DEFAULT_RULES[endpoint] || {
      limit: 100,
      window_seconds: 60,
      algorithm: "sliding_window"
    };

    let rule: RuleRequest = {
      client_id: resolvedClientId,
      endpoint,
      ...pathDefaults
    };

    if (ruleDataRaw) {
      try {
        const parsed = typeof ruleDataRaw === "string" ? JSON.parse(ruleDataRaw) : ruleDataRaw;
        rule = { ...rule, ...parsed };
      } catch (err) {
        logger.error({ err, resolvedClientId, endpoint }, "Middleware failed to parse rule");
      }
    }

    let result = {
      allowed: true,
      remaining: rule.limit
    };
    const nowMs = Date.now();

    switch (rule.algorithm) {
      case "token_bucket": {
        const refillRate = Math.max(1, Math.floor(rule.limit / rule.window_seconds));
        const resTB = await checkTokenBucket({
          clientId: resolvedClientId,
          endpoint,
          capacity: rule.limit,
          refillRate
        });
        result = resTB;
        break;
      }
      case "sliding_window": {
        const resSW = await checkSlidingWindow({
          clientId: resolvedClientId,
          endpoint,
          capacity: rule.limit,
          windowSizeMs: rule.window_seconds * 1000
        });
        result = resSW;
        break;
      }
      case "fixed_window": {
        const resFW = await checkFixedWindow({
          clientId: resolvedClientId,
          endpoint,
          capacity: rule.limit,
          windowSizeSeconds: rule.window_seconds
        });
        result = resFW;
        break;
      }
      default: {
        logger.error({ algorithm: rule.algorithm }, "Middleware unknown algorithm");
        next();
        return;
      }
    }

    const resetTimeUnix = Math.ceil((nowMs + (rule.window_seconds * 1000)) / 1000);
    res.setHeader("X-RateLimit-Limit", String(rule.limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
    res.setHeader("X-RateLimit-Reset", String(resetTimeUnix));

    if (!result.allowed) {
      res.setHeader("Retry-After", String(rule.window_seconds));
      checkRequestsTotal.inc({ algorithm: rule.algorithm, client_id: resolvedClientId, result: "deny" });
      
      redis.incr(statsDenyKey(resolvedClientId)).catch((err) => {
        logger.error({ err }, "Middleware failed to increment deny stat");
      });

      return res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later."
      });
    }

    checkRequestsTotal.inc({ algorithm: rule.algorithm, client_id: resolvedClientId, result: "allow" });
    
    redis.incr(statsAllowKey(resolvedClientId)).catch((err) => {
      logger.error({ err }, "Middleware failed to increment allow stat");
    });

    next();
  } catch (err) {
    logger.error({ err }, "Middleware critical exception");
    next(err);
  }
};

// =============================================================================
// Production Database API Seeder
// =============================================================================
import { logger } from "../lib/logger";

const rules = [
  {
    client_id: "user_premium_zone",
    endpoint: "/api/v1/checkout",
    limit: 100,
    window_seconds: 60,
    algorithm: "token_bucket" as const,
  },
  {
    client_id: "user_free_tier",
    endpoint: "/api/v1/analytics",
    limit: 5,
    window_seconds: 30,
    algorithm: "token_bucket" as const,
  },
  {
    client_id: "anonymous_crawler",
    endpoint: "/api/v1/search",
    limit: 3,
    window_seconds: 10,
    algorithm: "sliding_window" as const,
  },
  {
    client_id: "public_auth_gateway",
    endpoint: "/api/v1/login",
    limit: 5,
    window_seconds: 60,
    algorithm: "sliding_window" as const,
  },
  {
    client_id: "stripe_webhook_syncer",
    endpoint: "/api/v1/webhooks",
    limit: 50,
    window_seconds: 10,
    algorithm: "fixed_window" as const,
  },
];

async function run() {
  logger.info("Starting production API seeding sequence...");

  const adminKey = process.env["ADMIN_API_KEY"];
  const apiUrl = (process.env["API_URL"] || "https://rate-lockr-5z23.vercel.app").replace(/\/+$/, "");

  if (!adminKey) {
    logger.error("ADMIN_API_KEY environment variable is required. Aborting.");
    process.exit(1);
  }

  const baseUrl = `${apiUrl}/api/rules`;

  logger.info({ baseUrl }, "Selected target API URL for seeding");

  for (const rule of rules) {
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "x-api-key": adminKey,
          "content-type": "application/json"
        },
        body: JSON.stringify(rule)
      });
      
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      
      logger.info(
        { 
          status: res.status, 
          clientId: rule.client_id, 
          endpoint: rule.endpoint,
          response: parsed
        },
        "Ingested rule successfully via REST API"
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err: errMsg, clientId: rule.client_id, endpoint: rule.endpoint },
        "Failed to ingest rule"
      );
    }
  }
}

run();

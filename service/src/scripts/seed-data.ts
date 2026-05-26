import { redis } from "../store/redis";
import { rulesKey } from "../lib/keys";

// =============================================================================
// Standalone Database Seeder
// =============================================================================

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

async function seed() {
  console.log("Starting database seeding sequence...");

  try {
    for (const rule of rules) {
      const key = rulesKey(rule.client_id);
      await redis.hset(key, rule.endpoint, JSON.stringify(rule));
      console.log(`Successfully provisioned rule: ${rule.client_id} -> ${rule.endpoint}`);
    }

    console.log("All 5 rules have been successfully provisioned in the database!");
  } catch (err) {
    console.error("Seeding failed with error:", err);
  } finally {
    // Gracefully let the process exit
    await redis.quit();
  }
}

seed();

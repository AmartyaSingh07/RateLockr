"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("../store/redis");
const keys_1 = require("../lib/keys");
// =============================================================================
// Standalone Database Seeder
// =============================================================================
const rules = [
    {
        client_id: "user_premium_zone",
        endpoint: "/api/v1/checkout",
        limit: 100,
        window_seconds: 60,
        algorithm: "token_bucket",
    },
    {
        client_id: "user_free_tier",
        endpoint: "/api/v1/analytics",
        limit: 5,
        window_seconds: 30,
        algorithm: "token_bucket",
    },
    {
        client_id: "anonymous_crawler",
        endpoint: "/api/v1/search",
        limit: 3,
        window_seconds: 10,
        algorithm: "sliding_window",
    },
    {
        client_id: "public_auth_gateway",
        endpoint: "/api/v1/login",
        limit: 5,
        window_seconds: 60,
        algorithm: "sliding_window",
    },
    {
        client_id: "stripe_webhook_syncer",
        endpoint: "/api/v1/webhooks",
        limit: 50,
        window_seconds: 10,
        algorithm: "fixed_window",
    },
];
async function seed() {
    console.log("Starting database seeding sequence...");
    try {
        for (const rule of rules) {
            const key = (0, keys_1.rulesKey)(rule.client_id);
            await redis_1.redis.hset(key, rule.endpoint, JSON.stringify(rule));
            console.log(`Successfully provisioned rule: ${rule.client_id} -> ${rule.endpoint}`);
        }
        console.log("All 5 rules have been successfully provisioned in the database!");
    }
    catch (err) {
        console.error("Seeding failed with error:", err);
    }
    finally {
        // Gracefully let the process exit
        await redis_1.redis.quit();
    }
}
seed();
//# sourceMappingURL=seed-data.js.map
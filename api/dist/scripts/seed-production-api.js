"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================================
// Production Database API Seeder
// =============================================================================
const logger_1 = require("../lib/logger");
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
async function run() {
    logger_1.logger.info("Starting production API seeding sequence...");
    const adminKey = "dev_admin_secret_key_987654321";
    // First, verify whether to use /api/rules or /rules
    let baseUrl = "https://ratelockr-api.onrender.com/rules";
    try {
        const testRes = await fetch("https://ratelockr-api.onrender.com/api/rules", {
            headers: { "x-api-key": adminKey }
        });
        if (testRes.status !== 404) {
            baseUrl = "https://ratelockr-api.onrender.com/api/rules";
        }
    }
    catch (err) {
        logger_1.logger.info({ err }, "Could not ping /api/rules, using /rules as fallback");
    }
    logger_1.logger.info({ baseUrl }, "Selected target API URL for seeding");
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
            }
            catch {
                parsed = text;
            }
            logger_1.logger.info({
                status: res.status,
                clientId: rule.client_id,
                endpoint: rule.endpoint,
                response: parsed
            }, "Ingested rule successfully via REST API");
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger_1.logger.error({ err: errMsg, clientId: rule.client_id, endpoint: rule.endpoint }, "Failed to ingest rule");
        }
    }
}
run();
//# sourceMappingURL=seed-production-api.js.map
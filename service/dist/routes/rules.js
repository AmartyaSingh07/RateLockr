"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validate_1 = require("../middleware/validate");
const ruleSchema_1 = require("../schemas/ruleSchema");
const redis_1 = require("../store/redis");
const keys_1 = require("../lib/keys");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../lib/logger");
const router = (0, express_1.Router)();
// Secure all rule routes with admin API key middleware
router.use(auth_1.requireAdmin);
// ─────────────────────────────────────────────────────────────────────────────
// GET / — Fetch ALL rules across ALL clients (for the admin dashboard table)
// ─────────────────────────────────────────────────────────────────────────────
// Scans rl:rules:* keys, pipelines hgetall for each, and flattens into a
// single array. Returns { rules: [...] } with a safe empty fallback.
// ─────────────────────────────────────────────────────────────────────────────
async function scanKeys(pattern) {
    try {
        const keys = [];
        let cursor = "0";
        do {
            const result = await redis_1.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            if (!result || !Array.isArray(result))
                break;
            const [nextCursor, batch] = result;
            cursor = nextCursor || "0";
            if (batch && Array.isArray(batch))
                keys.push(...batch);
            else
                break;
        } while (cursor !== "0");
        return keys;
    }
    catch (err) {
        logger_1.logger.error({ err, pattern }, "Error scanning rule keys from Redis");
        return [];
    }
}
router.get("/", async (_req, res) => {
    try {
        const ruleKeys = await scanKeys("rl:rules:*");
        if (ruleKeys.length === 0) {
            res.status(200).json({ rules: [] });
            return;
        }
        // Pipeline hgetall for every discovered rule hash
        const pipeline = redis_1.redis.pipeline();
        for (const key of ruleKeys) {
            pipeline.hgetall(key);
        }
        const pipelineResults = await pipeline.exec();
        const results = pipelineResults ?? [];
        const rules = [];
        for (const result of results) {
            if (!result || !Array.isArray(result))
                continue;
            const [err, hash] = result;
            if (err || !hash || typeof hash !== "object")
                continue;
            // Each hash field value is a JSON-stringified rule object
            for (const raw of Object.values(hash)) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.client_id && parsed.endpoint) {
                        rules.push(parsed);
                    }
                }
                catch {
                    // Skip malformed entries
                }
            }
        }
        res.status(200).json({ rules });
    }
    catch (err) {
        logger_1.logger.error({ err }, "Failed to fetch all rules, returning fallback");
        res.status(200).json({ rules: [] });
    }
});
router.post("/", (0, validate_1.validateBody)(ruleSchema_1.ruleSchema), async (req, res, next) => {
    try {
        const rule = req.body;
        const key = (0, keys_1.rulesKey)(rule.client_id);
        await redis_1.redis.hset(key, rule.endpoint, JSON.stringify(rule));
        logger_1.logger.info({ rule }, "Rule created or updated");
        res.status(201).json({ success: true, rule });
    }
    catch (err) {
        next(err);
    }
});
// Fetch all rules mapped to a specific client ID
router.get("/:client_id", async (req, res, next) => {
    try {
        const { client_id } = req.params;
        const key = (0, keys_1.rulesKey)(client_id);
        const rulesRaw = (await redis_1.redis.hgetall(key)) ?? {};
        const rules = Object.values(rulesRaw).map(raw => {
            try {
                return JSON.parse(raw);
            }
            catch {
                return null;
            }
        }).filter(Boolean);
        res.status(200).json({ rules });
    }
    catch (err) {
        next(err);
    }
});
// Delete a specific endpoint rule for a client
router.delete("/:client_id/:endpoint", async (req, res, next) => {
    try {
        const { client_id, endpoint } = req.params;
        const key = (0, keys_1.rulesKey)(client_id);
        const result = await redis_1.redis.hdel(key, endpoint);
        if (result === 0) {
            res.status(404).json({ error: "Rule not found" });
            return;
        }
        logger_1.logger.info({ client_id, endpoint }, "Rule deleted");
        res.status(200).json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=rules.js.map
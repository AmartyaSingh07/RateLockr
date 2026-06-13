"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.logger = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const logger_1 = require("./lib/logger");
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return logger_1.logger; } });
const redis_1 = require("./store/redis");
const requestId_1 = require("./middleware/requestId");
const check_1 = __importDefault(require("./routes/check"));
const rules_1 = __importDefault(require("./routes/rules"));
const metrics_1 = __importDefault(require("./routes/metrics"));
const stats_1 = __importDefault(require("./routes/stats"));
const rateLimiter_1 = require("./middleware/rateLimiter");
// =============================================================================
// Express Application
// =============================================================================
exports.app = (0, express_1.default)();
// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------
// CORS — permit the production Vercel dashboard and local dev servers
exports.app.use((0, cors_1.default)({
    origin: ["https://rate-lockr.vercel.app", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Client-ID"]
}));
exports.app.use(requestId_1.requestIdMiddleware);
exports.app.use(express_1.default.json());
// ---------------------------------------------------------------------------
// Route Mounting
// ---------------------------------------------------------------------------
exports.app.use("/api/check", check_1.default);
exports.app.use("/api/rules", rules_1.default);
exports.app.use("/api/metrics", metrics_1.default);
exports.app.use("/api/stats", stats_1.default);
exports.app.get('/api/v1/search', rateLimiter_1.rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Search results fetched successfully." }));
exports.app.post('/api/v1/login', rateLimiter_1.rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Authentication gateway cleared." }));
exports.app.post('/api/v1/webhooks', rateLimiter_1.rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Webhook synchronized securely." }));
exports.app.get('/api/v1/analytics', rateLimiter_1.rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Analytics packet ingested." }));
exports.app.post('/api/v1/checkout', rateLimiter_1.rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Checkout order processed successfully." }));
exports.app.get("/version", (_req, res) => {
    res.status(200).json({ version: "v1.0.1-seeding-fix" });
});
exports.app.get("/test-scan", async (_req, res) => {
    try {
        const rawResult = await redis_1.redis.scan("0", "MATCH", "rl:rules:*", "COUNT", 100);
        res.status(200).json({ rawResult });
    }
    catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});
// =============================================================================
// Health Check — GET /health
// =============================================================================
// Performs a live PING against Redis to report real connectivity status.
// Returns 200 + "connected" on success, 503 + "disconnected" on failure.
// Used by container orchestrators, load balancers, and the future dashboard.
// =============================================================================
exports.app.get("/health", async (_req, res) => {
    // Fast-path: if ioredis knows it's not connected, respond immediately
    // without issuing a command that would queue indefinitely.
    if (redis_1.redis.status !== "ready") {
        res.status(503).json({ status: "error", redis: "disconnected" });
        return;
    }
    try {
        // Race the ping against a 2s timeout to prevent hanging if Redis
        // becomes unresponsive mid-request.
        const timeout = new Promise((_resolve, reject) => setTimeout(() => reject(new Error("ping timeout")), 2_000));
        const pong = await Promise.race([redis_1.redis.ping(), timeout]);
        if (pong === "PONG") {
            res.status(200).json({ status: "ok", redis: "connected" });
        }
        else {
            res.status(503).json({ status: "error", redis: "disconnected" });
        }
    }
    catch {
        res.status(503).json({ status: "error", redis: "disconnected" });
    }
});
// =============================================================================
// Global Error Handler
// =============================================================================
exports.app.use((err, req, res, _next) => {
    logger_1.logger.error({ err: err.message, stack: err.stack, reqId: req.headers["x-request-id"] }, "Unhandled exception");
    // Ensure no stack traces leak in production
    res.status(500).json({ error: "Internal Server Error" });
});
// =============================================================================
// Server Bootstrap
// =============================================================================
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
// Only start listening when this file is run directly (not imported by tests)
if (require.main === module) {
    // Initialize Redis first (fail-open: server starts even if Redis is down)
    (0, redis_1.initRedis)().then(() => {
        exports.app.listen(PORT, "0.0.0.0", () => {
            logger_1.logger.info({ port: PORT }, `🚀 RateLockr service is running on port ${PORT}`);
        });
    });
}
//# sourceMappingURL=app.js.map
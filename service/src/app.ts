import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { logger } from "./lib/logger";
import { redis, initRedis } from "./store/redis";
import { requestIdMiddleware } from "./middleware/requestId";
import checkRouter from "./routes/check";
import rulesRouter from "./routes/rules";
import metricsRouter from "./routes/metrics";
import statsRouter from "./routes/stats";
import { rateLimiterMiddleware } from "./middleware/rateLimiter";

// Re-export for downstream consumers
export { logger };

// =============================================================================
// Express Application
// =============================================================================

export const app = express();

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// CORS — permit the production Vercel dashboard and local dev servers
app.use(
  cors({
    origin: [
      "https://rate-lockr.vercel.app",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
    credentials: true,
  })
);

app.use(requestIdMiddleware);
app.use(express.json());

// ---------------------------------------------------------------------------
// Route Mounting
// ---------------------------------------------------------------------------

app.use("/api/check", checkRouter);
app.use("/api/rules", rulesRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/stats", statsRouter);

const mockRouter = express.Router();
mockRouter.get('/v1/search', rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Search results fetched successfully." }));
mockRouter.post('/v1/login', rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Authentication gateway cleared." }));
mockRouter.post('/v1/webhooks', rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Webhook synchronized securely." }));
mockRouter.get('/v1/analytics', rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Analytics packet ingested." }));
mockRouter.post('/v1/checkout', rateLimiterMiddleware, (_req, res) => res.json({ success: true, message: "Checkout order processed successfully." }));

app.use('/api', mockRouter);

app.get("/version", (_req, res) => {
  res.status(200).json({ version: "v1.0.1-seeding-fix" });
});

app.get("/test-scan", async (_req, res) => {
  try {
    const rawResult = await redis.scan("0", "MATCH", "rl:rules:*", "COUNT", 100);
    res.status(200).json({ rawResult });
  } catch (err: any) {
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

app.get("/health", async (_req: Request, res: Response) => {
  // Fast-path: if ioredis knows it's not connected, respond immediately
  // without issuing a command that would queue indefinitely.
  if (redis.status !== "ready") {
    res.status(503).json({ status: "error", redis: "disconnected" });
    return;
  }

  try {
    // Race the ping against a 2s timeout to prevent hanging if Redis
    // becomes unresponsive mid-request.
    const timeout = new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("ping timeout")), 2_000)
    );
    const pong = await Promise.race([redis.ping(), timeout]);

    if (pong === "PONG") {
      res.status(200).json({ status: "ok", redis: "connected" });
    } else {
      res.status(503).json({ status: "error", redis: "disconnected" });
    }
  } catch {
    res.status(503).json({ status: "error", redis: "disconnected" });
  }
});

// =============================================================================
// Global Error Handler
// =============================================================================

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(
    { err: err.message, stack: err.stack, reqId: req.headers["x-request-id"] }, 
    "Unhandled exception"
  );
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
  initRedis().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      logger.info({ port: PORT }, `🚀 RateLockr service is running on port ${PORT}`);
    });
  });
}

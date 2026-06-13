import { Router, Request, Response, NextFunction } from "express";
import { register } from "../metrics";
import { logger } from "../lib/logger";

const router = Router();

// Standard public /metrics endpoint for Prometheus scraping
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await register.metrics();
    res.setHeader("Content-Type", register.contentType);
    res.send(metrics);
  } catch (err) {
    logger.error({ err }, "Failed to generate Prometheus metrics");
    next(err);
  }
});

export default router;

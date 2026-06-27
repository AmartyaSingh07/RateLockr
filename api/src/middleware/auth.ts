import { Request, Response, NextFunction } from "express";

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const expectedKey = process.env["ADMIN_API_KEY"];

  // Fail loud at startup if the key is not configured — do not silently
  // fall back to a default that is committed in the public repo.
  if (!expectedKey) {
    res.status(503).json({
      error: "Service misconfigured",
      message: "ADMIN_API_KEY environment variable is not set.",
    });
    return;
  }

  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== expectedKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

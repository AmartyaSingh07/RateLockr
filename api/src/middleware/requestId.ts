import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incomingId = req.headers["x-request-id"];
  const reqId = (Array.isArray(incomingId) ? incomingId[0] : incomingId) || crypto.randomUUID();
  
  // Expose for downstream loggers
  req.headers["x-request-id"] = reqId;
  res.setHeader("X-Request-ID", reqId);
  
  next();
};

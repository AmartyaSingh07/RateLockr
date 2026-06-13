import pino from "pino";

// =============================================================================
// Shared Pino Logger
// =============================================================================
// Structured JSON in production (for log aggregation pipelines).
// Pretty-printed with color in development for human readability.
// =============================================================================

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  transport:
    process.env["NODE_ENV"] !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

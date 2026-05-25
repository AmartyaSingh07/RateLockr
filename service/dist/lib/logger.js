"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
// =============================================================================
// Shared Pino Logger
// =============================================================================
// Structured JSON in production (for log aggregation pipelines).
// Pretty-printed with color in development for human readability.
// =============================================================================
exports.logger = (0, pino_1.default)({
    level: process.env["LOG_LEVEL"] ?? "info",
    transport: process.env["NODE_ENV"] !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
});
//# sourceMappingURL=logger.js.map
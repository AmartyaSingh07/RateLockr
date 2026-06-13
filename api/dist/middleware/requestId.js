"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = void 0;
const crypto_1 = __importDefault(require("crypto"));
const requestIdMiddleware = (req, res, next) => {
    const incomingId = req.headers["x-request-id"];
    const reqId = (Array.isArray(incomingId) ? incomingId[0] : incomingId) || crypto_1.default.randomUUID();
    // Expose for downstream loggers
    req.headers["x-request-id"] = reqId;
    res.setHeader("X-Request-ID", reqId);
    next();
};
exports.requestIdMiddleware = requestIdMiddleware;
//# sourceMappingURL=requestId.js.map
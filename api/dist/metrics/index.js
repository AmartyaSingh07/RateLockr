"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rulesTotal = exports.redisErrorsTotal = exports.checkDurationMs = exports.checkRequestsTotal = exports.register = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
// Expose the global register for the /metrics route
exports.register = prom_client_1.default.register;
// Automatically collect default Node.js metrics (memory, CPU, event loop)
prom_client_1.default.collectDefaultMetrics({
    prefix: 'ratelockr_node_',
});
// =============================================================================
// RateLockr Custom Metrics
// =============================================================================
exports.checkRequestsTotal = new prom_client_1.default.Counter({
    name: "ratelockr_check_requests_total",
    help: "Total number of rate limit evaluation requests",
    labelNames: ["algorithm", "client_id", "result"],
});
exports.checkDurationMs = new prom_client_1.default.Histogram({
    name: "ratelockr_check_duration_ms",
    help: "Duration of rate limit evaluation in milliseconds",
    labelNames: ["algorithm"],
    // Optimize buckets for sub-millisecond to 50ms (our target is < 5ms p99)
    buckets: [0.5, 1, 2, 5, 10, 20, 50, 100],
});
exports.redisErrorsTotal = new prom_client_1.default.Counter({
    name: "ratelockr_redis_errors_total",
    help: "Total number of Redis connection or execution errors",
    labelNames: ["operation"],
});
exports.rulesTotal = new prom_client_1.default.Gauge({
    name: "ratelockr_rules_total",
    help: "Total number of active client rules provisioned",
});
//# sourceMappingURL=index.js.map
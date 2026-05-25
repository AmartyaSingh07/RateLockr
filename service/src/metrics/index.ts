import client from "prom-client";

// Expose the global register for the /metrics route
export const register = client.register;

// Automatically collect default Node.js metrics (memory, CPU, event loop)
client.collectDefaultMetrics({
  prefix: 'ratelockr_node_',
});

// =============================================================================
// RateLockr Custom Metrics
// =============================================================================

export const checkRequestsTotal = new client.Counter({
  name: "ratelockr_check_requests_total",
  help: "Total number of rate limit evaluation requests",
  labelNames: ["algorithm", "client_id", "result"],
});

export const checkDurationMs = new client.Histogram({
  name: "ratelockr_check_duration_ms",
  help: "Duration of rate limit evaluation in milliseconds",
  labelNames: ["algorithm"],
  // Optimize buckets for sub-millisecond to 50ms (our target is < 5ms p99)
  buckets: [0.5, 1, 2, 5, 10, 20, 50, 100],
});

export const redisErrorsTotal = new client.Counter({
  name: "ratelockr_redis_errors_total",
  help: "Total number of Redis connection or execution errors",
  labelNames: ["operation"],
});

export const rulesTotal = new client.Gauge({
  name: "ratelockr_rules_total",
  help: "Total number of active client rules provisioned",
});

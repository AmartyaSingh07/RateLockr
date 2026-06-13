import client from "prom-client";
export declare const register: client.Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const checkRequestsTotal: client.Counter<"client_id" | "algorithm" | "result">;
export declare const checkDurationMs: client.Histogram<"algorithm">;
export declare const redisErrorsTotal: client.Counter<"operation">;
export declare const rulesTotal: client.Gauge<string>;
//# sourceMappingURL=index.d.ts.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ruleSchema = void 0;
const zod_1 = require("zod");
exports.ruleSchema = zod_1.z.object({
    client_id: zod_1.z.string().max(128),
    endpoint: zod_1.z.string().max(256),
    limit: zod_1.z.number().int().min(1),
    window_seconds: zod_1.z.number().int().min(1),
    algorithm: zod_1.z.enum(["token_bucket", "sliding_window", "fixed_window"]),
}).strict();
//# sourceMappingURL=ruleSchema.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSchema = void 0;
const zod_1 = require("zod");
exports.checkSchema = zod_1.z.object({
    client_id: zod_1.z.string().max(128),
    endpoint: zod_1.z.string().max(256),
    algorithm: zod_1.z.enum(["token_bucket", "sliding_window", "fixed_window"]).optional(),
}).strict();
//# sourceMappingURL=checkSchema.js.map
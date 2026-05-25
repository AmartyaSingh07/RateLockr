"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = void 0;
const zod_1 = require("zod");
const validateBody = (schema) => {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                res.status(400).json({
                    error: "Validation Error",
                    details: err.errors,
                });
                return;
            }
            next(err);
        }
    };
};
exports.validateBody = validateBody;
//# sourceMappingURL=validate.js.map
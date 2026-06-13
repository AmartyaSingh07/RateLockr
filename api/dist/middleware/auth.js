"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const requireAdmin = (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    const expectedKey = process.env.ADMIN_API_KEY || "dev_admin_secret_key_987654321";
    if (!apiKey || apiKey !== expectedKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
//# sourceMappingURL=auth.js.map
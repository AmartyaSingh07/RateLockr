"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const metrics_1 = require("../metrics");
const logger_1 = require("../lib/logger");
const router = (0, express_1.Router)();
// Standard public /metrics endpoint for Prometheus scraping
router.get("/", async (_req, res, next) => {
    try {
        const metrics = await metrics_1.register.metrics();
        res.setHeader("Content-Type", metrics_1.register.contentType);
        res.send(metrics);
    }
    catch (err) {
        logger_1.logger.error({ err }, "Failed to generate Prometheus metrics");
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=metrics.js.map
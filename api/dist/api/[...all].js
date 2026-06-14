"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = vercelHandler;
const app_1 = require("../src/app");
const redis_1 = require("../src/store/redis");
let initPromise = null;
function initializeOnce() {
    if (!initPromise) {
        initPromise = (0, redis_1.initRedis)();
    }
    return initPromise;
}
async function vercelHandler(req, res) {
    await initializeOnce();
    return (0, app_1.app)(req, res);
}
//# sourceMappingURL=%5B...all%5D.js.map
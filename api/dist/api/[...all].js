"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = vercelHandler;
const serverless_http_1 = __importDefault(require("serverless-http"));
const app_1 = require("../src/app");
const redis_1 = require("../src/store/redis");
let initPromise = null;
function initializeOnce() {
    if (!initPromise) {
        initPromise = (0, redis_1.initRedis)();
    }
    return initPromise;
}
const handler = (0, serverless_http_1.default)(app_1.app);
async function vercelHandler(req, res) {
    await initializeOnce();
    return handler(req, res);
}
//# sourceMappingURL=%5B...all%5D.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.evictExpiredOrStaleKeys = evictExpiredOrStaleKeys;
exports.startEvictionRoutine = startEvictionRoutine;
exports.stopEvictionRoutine = stopEvictionRoutine;
exports.initRedis = initRedis;
exports.shutdownRedis = shutdownRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const redis_1 = require("@upstash/redis");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const logger_1 = require("../lib/logger");
// =============================================================================
// Connection URL Resolution
// =============================================================================
function resolveRedisUrl() {
    const explicit = process.env["REDIS_URL"];
    if (explicit)
        return explicit;
    const host = process.env["REDIS_HOST"] ?? "localhost";
    const port = process.env["REDIS_PORT"] ?? "6379";
    const password = process.env["REDIS_PASSWORD"];
    if (password) {
        return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
    }
    return `redis://${host}:${port}`;
}
const redisUrl = resolveRedisUrl();
// Detect if we should use Upstash HTTP REST or standard TCP ioredis
const useUpstash = !!(process.env["UPSTASH_REDIS_REST_URL"] ||
    process.env["UPSTASH_REDIS_REST_TOKEN"]);
logger_1.logger.info({ useUpstash, url: useUpstash ? "Upstash HTTP REST" : redisUrl.replace(/:[^:@]+@/, ":****@") }, "Selecting Redis connection driver strategy");
// =============================================================================
// Upstash HTTP REST SDK Wrapper
// =============================================================================
class UpstashRedisWrapper {
    client;
    status = "ready";
    luaScripts = {};
    constructor() {
        // Instantiate directly using the official environment variable loader
        this.client = redis_1.Redis.fromEnv();
    }
    async connect() {
        return Promise.resolve();
    }
    async quit() {
        return Promise.resolve();
    }
    on(event, listener) {
        if (event === "connect" || event === "ready") {
            setTimeout(listener, 0);
        }
        return this;
    }
    async ping() {
        try {
            const res = await this.client.ping();
            return res === "PONG" ? "PONG" : String(res);
        }
        catch {
            return "PONG";
        }
    }
    defineCommand(name, definition) {
        this.luaScripts[name] = {
            lua: definition.lua,
            numberOfKeys: definition.numberOfKeys,
        };
        this[name] = async (...args) => {
            const numKeys = definition.numberOfKeys;
            const keys = args.slice(0, numKeys);
            const evalArgs = args.slice(numKeys);
            const res = await this.client.eval(definition.lua, keys, evalArgs);
            return res;
        };
    }
    async hget(key, field) {
        const res = await this.client.hget(key, field);
        return res === undefined ? null : res;
    }
    async hset(key, field, value) {
        return this.client.hset(key, { [field]: value });
    }
    async hdel(key, ...fields) {
        return this.client.hdel(key, ...fields);
    }
    async hgetall(key) {
        const res = await this.client.hgetall(key);
        return res ?? {};
    }
    async hlen(key) {
        return this.client.hlen(key);
    }
    async get(key) {
        return this.client.get(key);
    }
    async incr(key) {
        return this.client.incr(key);
    }
    async hmget(key, ...fields) {
        const result = (await this.client.hmget(key, ...fields));
        if (!result)
            return fields.map(() => null);
        return result.map((v) => v === null || v === undefined ? null : String(v));
    }
    async hmset(key, ...args) {
        const obj = {};
        for (let i = 0; i < args.length; i += 2) {
            if (args[i] !== undefined && args[i + 1] !== undefined) {
                obj[args[i]] = args[i + 1];
            }
        }
        await this.client.hmset(key, obj);
        return "OK";
    }
    async lpush(key, ...values) {
        return this.client.lpush(key, ...values);
    }
    async ltrim(key, start, stop) {
        return this.client.ltrim(key, start, stop);
    }
    async lrange(key, start, stop) {
        const res = await this.client.lrange(key, start, stop);
        return res ?? [];
    }
    async zcard(key) {
        return this.client.zcard(key);
    }
    async del(key) {
        return this.client.del(key);
    }
    async scan(cursor, ...args) {
        let pattern = "*";
        let count = 10;
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (typeof arg === "string" && arg.toUpperCase() === "MATCH" && args[i + 1]) {
                pattern = String(args[i + 1]);
            }
            if (typeof arg === "string" && arg.toUpperCase() === "COUNT" && args[i + 1]) {
                count = parseInt(String(args[i + 1]), 10) || 10;
            }
        }
        const [nextCursor, keys] = (await this.client.scan(cursor, { match: pattern, count }));
        return [nextCursor || "0", keys || []];
    }
    pipeline() {
        const p = this.client.pipeline();
        const builder = {
            get(key) {
                p.get(key);
                return builder;
            },
            hgetall(key) {
                p.hgetall(key);
                return builder;
            },
            hlen(key) {
                p.hlen(key);
                return builder;
            },
            ttl(key) {
                p.ttl(key);
                return builder;
            },
            type(key) {
                p.type(key);
                return builder;
            },
            del(key) {
                p.del(key);
                return builder;
            },
            object(_sub, key) {
                p.execute(["OBJECT", "IDLETIME", key]);
                return builder;
            },
            async exec() {
                const results = await p.exec();
                if (!results)
                    return null;
                return results.map((res) => [null, res]);
            }
        };
        return builder;
    }
}
// =============================================================================
// standard TCP ioredis Driver Wrapper
// =============================================================================
class IORedisWrapper {
    client;
    status;
    constructor(url) {
        this.client = new ioredis_1.default(url, {
            lazyConnect: true,
            maxRetriesPerRequest: null,
            connectTimeout: 5_000,
            ...(url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {}),
            retryStrategy(times) {
                return Math.min(200 * Math.pow(2, times - 1), 2_000);
            }
        });
        this.status = this.client.status;
        this.client.on("connect", () => { this.status = this.client.status; });
        this.client.on("ready", () => { this.status = this.client.status; });
        this.client.on("close", () => { this.status = this.client.status; });
        this.client.on("end", () => { this.status = this.client.status; });
    }
    async connect() {
        return this.client.connect();
    }
    async quit() {
        return this.client.quit();
    }
    on(event, listener) {
        this.client.on(event, listener);
        return this;
    }
    async ping() {
        return this.client.ping();
    }
    defineCommand(name, definition) {
        this.client.defineCommand(name, definition);
        this[name] = (...args) => this.client[name](...args);
    }
    async hget(key, field) {
        return this.client.hget(key, field);
    }
    async hset(key, field, value) {
        return this.client.hset(key, field, value);
    }
    async hdel(key, ...fields) {
        return this.client.hdel(key, ...fields);
    }
    async hgetall(key) {
        return this.client.hgetall(key);
    }
    async hlen(key) {
        return this.client.hlen(key);
    }
    async get(key) {
        return this.client.get(key);
    }
    async incr(key) {
        return this.client.incr(key);
    }
    async hmget(key, ...fields) {
        return this.client.hmget(key, ...fields);
    }
    async hmset(key, ...args) {
        return this.client.hmset(key, ...args);
    }
    async lpush(key, ...values) {
        return this.client.lpush(key, ...values);
    }
    async ltrim(key, start, stop) {
        return this.client.ltrim(key, start, stop);
    }
    async lrange(key, start, stop) {
        return this.client.lrange(key, start, stop);
    }
    async zcard(key) {
        return this.client.zcard(key);
    }
    async del(key) {
        return this.client.del(key);
    }
    async scan(cursor, ...args) {
        return this.client.scan(cursor, ...args);
    }
    pipeline() {
        return this.client.pipeline();
    }
}
// Instantiate connection wrapper dynamically based on connection protocol
exports.redis = useUpstash
    ? new UpstashRedisWrapper()
    : new IORedisWrapper(redisUrl);
// Support both named and default exports for maximum compatibility
exports.default = exports.redis;
// ---------------------------------------------------------------------------
// Event listeners — keep the process informed without crashing
// ---------------------------------------------------------------------------
exports.redis.on("error", (err) => {
    logger_1.logger.error({ err: err?.message || String(err) }, "Redis connection error");
});
exports.redis.on("connect", () => {
    logger_1.logger.info("Redis TCP connection established");
});
exports.redis.on("ready", () => {
    logger_1.logger.info("Redis client ready to accept commands");
});
exports.redis.on("close", () => {
    logger_1.logger.warn("Redis connection closed");
});
exports.redis.on("reconnecting", (ms) => {
    logger_1.logger.info({ inMs: ms }, "Redis reconnecting");
});
// =============================================================================
// Lua Script Boot-loader
// =============================================================================
const SCRIPTS_DIR = path_1.default.join(__dirname, "..", "scripts");
function parseNumberOfKeys(content) {
    const match = content.match(/^--\s*KEYS:\s*(\d+)/m);
    return match ? parseInt(match[1], 10) : 1;
}
async function bootstrapLuaScripts() {
    const registered = [];
    try {
        const entries = await promises_1.default.readdir(SCRIPTS_DIR);
        const luaFiles = entries.filter((f) => f.endsWith(".lua")).sort();
        if (luaFiles.length === 0) {
            logger_1.logger.warn({ dir: SCRIPTS_DIR }, "No .lua scripts found in scripts directory");
            return registered;
        }
        for (const file of luaFiles) {
            const filePath = path_1.default.join(SCRIPTS_DIR, file);
            const content = await promises_1.default.readFile(filePath, "utf-8");
            const commandName = path_1.default.basename(file, ".lua");
            const numberOfKeys = parseNumberOfKeys(content);
            exports.redis.defineCommand(commandName, {
                numberOfKeys,
                lua: content,
            });
            registered.push(commandName);
            logger_1.logger.debug({ command: commandName, numberOfKeys, file }, "Registered Lua script");
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message, dir: SCRIPTS_DIR }, "Failed to bootstrap Lua scripts");
        throw err;
    }
    return registered;
}
// =============================================================================
// Background Metric Eviction Routine
// =============================================================================
let evictionIntervalId = null;
async function scanKeys(pattern) {
    const keys = [];
    try {
        let cursor = "0";
        do {
            const result = await exports.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            if (!result || !Array.isArray(result))
                break;
            const [nextCursor, batch] = result;
            cursor = nextCursor || "0";
            if (batch && Array.isArray(batch)) {
                keys.push(...batch);
            }
            else {
                break;
            }
        } while (cursor !== "0");
    }
    catch (err) {
        logger_1.logger.error({ err, pattern }, "Error scanning keys during eviction");
    }
    return keys;
}
async function evictExpiredOrStaleKeys() {
    if (exports.redis.status !== "ready") {
        logger_1.logger.warn("Skipping eviction routine: Redis is not connected");
        return 0;
    }
    let evictedCount = 0;
    try {
        const keysToDelete = [];
        const patterns = ["rl:tb:*", "rl:sw:*", "rl:fw:*"];
        const allKeys = [];
        for (const pattern of patterns) {
            const keys = await scanKeys(pattern);
            allKeys.push(...keys);
        }
        if (allKeys.length > 0) {
            const pipeline = exports.redis.pipeline();
            for (const key of allKeys) {
                pipeline.ttl(key);
                pipeline.type(key);
            }
            const results = await pipeline.exec();
            if (results) {
                for (let i = 0; i < allKeys.length; i++) {
                    const key = allKeys[i];
                    const ttlResult = results[i * 2];
                    const typeResult = results[i * 2 + 1];
                    const ttl = ttlResult && Array.isArray(ttlResult) ? ttlResult[1] : -2;
                    const type = typeResult && Array.isArray(typeResult) ? typeResult[1] : "none";
                    if (ttl === -1) {
                        keysToDelete.push(key);
                        continue;
                    }
                    if (type === "zset") {
                        const card = await exports.redis.zcard(key);
                        if (card === 0) {
                            keysToDelete.push(key);
                        }
                    }
                    else if (type === "hash") {
                        const len = await exports.redis.hlen(key);
                        if (len === 0) {
                            keysToDelete.push(key);
                        }
                    }
                }
            }
        }
        const statsPatterns = [
            "stats:allow:*",
            "stats:deny:*",
            "rl:metrics:timeline:*",
            "rl:metrics:last_cumulative:*"
        ];
        const statsKeys = [];
        for (const pattern of statsPatterns) {
            const keys = await scanKeys(pattern);
            statsKeys.push(...keys);
        }
        if (statsKeys.length > 0) {
            const MAX_IDLE_TIME_SECONDS = 300;
            const statsPipeline = exports.redis.pipeline();
            for (const key of statsKeys) {
                statsPipeline.object("IDLETIME", key);
            }
            const idleResults = await statsPipeline.exec();
            if (idleResults) {
                for (let i = 0; i < statsKeys.length; i++) {
                    const key = statsKeys[i];
                    const idleResult = idleResults[i];
                    const idleTime = idleResult && Array.isArray(idleResult) ? idleResult[1] : 0;
                    if (idleTime > MAX_IDLE_TIME_SECONDS) {
                        keysToDelete.push(key);
                    }
                }
            }
        }
        if (keysToDelete.length > 0) {
            const deletePipeline = exports.redis.pipeline();
            for (const key of keysToDelete) {
                deletePipeline.del(key);
            }
            await deletePipeline.exec();
            evictedCount = keysToDelete.length;
            logger_1.logger.info({ evictedKeys: keysToDelete }, `Evicted ${evictedCount} stale rate limit / stats keys from Redis`);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message }, "Failed to execute eviction routine");
    }
    return evictedCount;
}
function startEvictionRoutine(intervalMs = 60_000) {
    if (evictionIntervalId) {
        clearInterval(evictionIntervalId);
    }
    evictionIntervalId = setInterval(async () => {
        logger_1.logger.debug("Executing background rate limit key eviction...");
        await evictExpiredOrStaleKeys();
    }, intervalMs);
    logger_1.logger.info({ intervalMs }, "Background metric eviction routine started");
}
function stopEvictionRoutine() {
    if (evictionIntervalId) {
        clearInterval(evictionIntervalId);
        evictionIntervalId = null;
        logger_1.logger.info("Background metric eviction routine stopped");
    }
}
// =============================================================================
// Public API
// =============================================================================
async function initRedis() {
    try {
        await exports.redis.connect();
        const scripts = await bootstrapLuaScripts();
        logger_1.logger.info({ scriptsRegistered: scripts.length, scripts }, "✅ Redis connected and all Lua scripts boot-loaded successfully");
        startEvictionRoutine();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message }, "Redis initialization failed — service will operate in degraded mode (fail-open)");
    }
}
async function shutdownRedis() {
    stopEvictionRoutine();
    await exports.redis.quit();
    logger_1.logger.info("Redis connection closed gracefully");
}
//# sourceMappingURL=redis.js.map
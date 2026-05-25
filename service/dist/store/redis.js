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
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const logger_1 = require("../lib/logger");
// =============================================================================
// Connection URL Resolution
// =============================================================================
// Priority: REDIS_URL env var > constructed from individual REDIS_HOST/PORT/PASSWORD
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
// =============================================================================
// Redis Client Instance
// =============================================================================
// - lazyConnect: explicit control over when the connection is established
// - maxRetriesPerRequest: null allows unlimited retries for blocking commands
// - connectTimeout: 5s cap so the boot sequence doesn't hang indefinitely
// - retryStrategy: exponential backoff from 200ms to 2s ceiling
// =============================================================================
const redisUrl = resolveRedisUrl();
const tlsOptions = redisUrl.startsWith("rediss") ? { tls: { rejectUnauthorized: false } } : {};
exports.redis = new ioredis_1.default(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    connectTimeout: 5_000,
    ...tlsOptions,
    retryStrategy(times) {
        const delay = Math.min(200 * Math.pow(2, times - 1), 2_000);
        logger_1.logger.warn({ attempt: times, nextRetryMs: delay }, "Redis reconnection attempt");
        return delay;
    },
});
// ---------------------------------------------------------------------------
// Event listeners — keep the process informed without crashing
// ---------------------------------------------------------------------------
exports.redis.on("error", (err) => {
    logger_1.logger.error({ err: err.message }, "Redis connection error");
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
// Scans src/scripts/ for *.lua files, reads each one, parses a `-- KEYS: N`
// header to determine the numberOfKeys, and registers the script on the Redis
// client via defineCommand(). The command name is derived from the filename.
// =============================================================================
const SCRIPTS_DIR = path_1.default.join(__dirname, "..", "scripts");
/**
 * Parse the number of KEYS a Lua script expects from its header comment.
 * Format: `-- KEYS: <number>`
 * Defaults to 1 if the header is missing.
 */
function parseNumberOfKeys(content) {
    const match = content.match(/^--\s*KEYS:\s*(\d+)/m);
    return match ? parseInt(match[1], 10) : 1;
}
/**
 * Scans the scripts/ directory for .lua files, reads each one, and registers
 * it as a custom Redis command via `redis.defineCommand()`.
 *
 * @returns Array of registered command names
 * @throws If the scripts directory cannot be read
 */
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
// A lightweight, non-blocking background routine that wakes up every 60 seconds,
// scans for rate limit keys (excluding rules configuration), and evicts keys
// that no longer possess a valid remaining TTL (TTL = -1) or contain empty sets/hashes.
// =============================================================================
let evictionIntervalId = null;
/**
 * Helper to scan keys matching a specific pattern using non-blocking SCAN.
 */
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
/**
 * Scan Redis for rate-limiting transactional keys and evict keys that:
 * - Have no expiration set (TTL is -1)
 * - Are empty ZSETs (sliding window log) or empty HASHes (token bucket)
 */
async function evictExpiredOrStaleKeys() {
    if (exports.redis.status !== "ready") {
        logger_1.logger.warn("Skipping eviction routine: Redis is not connected");
        return 0;
    }
    let evictedCount = 0;
    try {
        const keysToDelete = [];
        // ─── 1. Scan Rate Limiting Transactional Keys ───
        const patterns = ["rl:tb:*", "rl:sw:*", "rl:fw:*"];
        const allKeys = [];
        for (const pattern of patterns) {
            const keys = await scanKeys(pattern);
            allKeys.push(...keys);
        }
        if (allKeys.length > 0) {
            // Pipelined TTL and type checks
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
                    // If the key has no TTL set (ttl === -1), it has no valid remaining TTL. Evict it.
                    if (ttl === -1) {
                        keysToDelete.push(key);
                        continue;
                    }
                    // Check if it's an empty set/hash
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
        // ─── 2. Scan Un-expiring Client Stats & Metrics Frames ───
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
            const MAX_IDLE_TIME_SECONDS = 300; // 5 minutes of inactivity
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
        // ─── 3. Execute Deletion Pipeline ───
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
/**
 * Starts the recurring 60s background eviction routine.
 */
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
/**
 * Stops the recurring background eviction routine.
 */
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
/**
 * Connect to Redis and boot-load all Lua scripts.
 *
 * Must be called once at application startup. If Redis is unreachable,
 * the error is logged but NOT re-thrown — the service starts in degraded
 * mode (fail-open principle). ioredis will continue reconnecting in the
 * background via retryStrategy.
 */
async function initRedis() {
    try {
        await exports.redis.connect();
        const scripts = await bootstrapLuaScripts();
        logger_1.logger.info({ scriptsRegistered: scripts.length, scripts }, "✅ Redis connected and all Lua scripts boot-loaded successfully");
        // Start background key eviction routine
        startEvictionRoutine();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message }, "Redis initialization failed — service will operate in degraded mode (fail-open)");
    }
}
/**
 * Graceful shutdown — close the Redis connection cleanly.
 * Call this in your process SIGTERM/SIGINT handler.
 */
async function shutdownRedis() {
    stopEvictionRoutine();
    await exports.redis.quit();
    logger_1.logger.info("Redis connection closed gracefully");
}
//# sourceMappingURL=redis.js.map
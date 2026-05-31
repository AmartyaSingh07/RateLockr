import IORedis from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
import path from "path";
import fs from "fs/promises";
import { logger } from "../lib/logger";

// =============================================================================
// Connection URL Resolution
// =============================================================================

function resolveRedisUrl(): string {
  const explicit = process.env["REDIS_URL"];
  if (explicit) return explicit;

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
const useUpstash = !!(
  process.env["UPSTASH_REDIS_REST_URL"] ||
  process.env["UPSTASH_REDIS_REST_TOKEN"]
);

logger.info(
  { useUpstash, url: useUpstash ? "Upstash HTTP REST" : redisUrl.replace(/:[^:@]+@/, ":****@") },
  "Selecting Redis connection driver strategy"
);

// =============================================================================
// Redis Client Interface for Type Safety
// =============================================================================

export interface RedisClient {
  status: string;
  connect(): Promise<void>;
  quit(): Promise<string | void>;
  on(event: string, listener: (...args: any[]) => void): this;
  ping(): Promise<string>;
  defineCommand(name: string, definition: { numberOfKeys: number; lua: string }): void;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<number>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hlen(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  hmget(key: string, ...fields: string[]): Promise<Array<string | null>>;
  hmset(key: string, ...args: string[]): Promise<"OK" | number | string>;
  lpush(key: string, ...values: string[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<"OK" | string>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  zcard(key: string): Promise<number>;
  del(key: string): Promise<number>;
  scan(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]>;
  pipeline(): any;
  [key: string]: any;
}

// =============================================================================
// Upstash HTTP REST SDK Wrapper
// =============================================================================

class UpstashRedisWrapper implements RedisClient {
  [key: string]: any;
  private client: UpstashRedis;
  public status = "ready";
  private luaScripts: Record<string, { lua: string; numberOfKeys: number }> = {};

  constructor() {
    // Instantiate directly using the official environment variable loader
    this.client = UpstashRedis.fromEnv();
  }

  async connect() {
    return Promise.resolve();
  }

  async quit() {
    return Promise.resolve();
  }

  on(event: string, listener: (...args: any[]) => void) {
    if (event === "connect" || event === "ready") {
      setTimeout(listener, 0);
    }
    return this;
  }

  async ping() {
    const res = await this.client.ping();
    if (res !== "PONG") {
      throw new Error(`Upstash ping returned unexpected response: ${String(res)}`);
    }
    return "PONG";
  }

  defineCommand(name: string, definition: { numberOfKeys: number; lua: string }) {
    this.luaScripts[name] = {
      lua: definition.lua,
      numberOfKeys: definition.numberOfKeys,
    };

    this[name] = async (...args: string[]) => {
      const numKeys = definition.numberOfKeys;
      const keys = args.slice(0, numKeys);
      const evalArgs = args.slice(numKeys);
      const res = await this.client.eval(definition.lua, keys, evalArgs);
      return res;
    };
  }

  async hget(key: string, field: string) {
    const res = await this.client.hget<string>(key, field);
    return res === undefined ? null : res;
  }

  async hset(key: string, field: string, value: string) {
    return this.client.hset(key, { [field]: value });
  }

  async hdel(key: string, ...fields: string[]) {
    return this.client.hdel(key, ...fields);
  }

  async hgetall(key: string) {
    const res = await this.client.hgetall<Record<string, string>>(key);
    return res ?? {};
  }

  async hlen(key: string) {
    return this.client.hlen(key);
  }

  async get(key: string) {
    return this.client.get<string>(key);
  }

  async incr(key: string) {
    return this.client.incr(key);
  }

  async hmget(key: string, ...fields: string[]) {
    const result = (await this.client.hmget(key, ...fields)) as any;
    if (!result) return fields.map(() => null);
    return result.map((v: any) => v === null || v === undefined ? null : String(v));
  }

  async hmset(key: string, ...args: string[]) {
    const obj: Record<string, string> = {};
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] !== undefined && args[i+1] !== undefined) {
        obj[args[i]!] = args[i+1]!;
      }
    }
    await this.client.hmset(key, obj);
    return "OK";
  }

  async lpush(key: string, ...values: string[]) {
    return this.client.lpush(key, ...values);
  }

  async ltrim(key: string, start: number, stop: number) {
    return this.client.ltrim(key, start, stop);
  }

  async lrange(key: string, start: number, stop: number) {
    const res = await this.client.lrange<string>(key, start, stop);
    return res ?? [];
  }

  async zcard(key: string) {
    return this.client.zcard(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async scan(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]> {
    let pattern = "*";
    let count = 10;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (typeof arg === "string" && arg.toUpperCase() === "MATCH" && args[i+1]) {
        pattern = String(args[i+1]);
      }
      if (typeof arg === "string" && arg.toUpperCase() === "COUNT" && args[i+1]) {
        count = parseInt(String(args[i+1]), 10) || 10;
      }
    }

    const [nextCursor, keys] = (await this.client.scan(cursor, { match: pattern, count })) as [string, string[]];
    return [nextCursor || "0", keys || []];
  }

  pipeline() {
    const p = this.client.pipeline();

    // A dynamic Proxy that forwards any command to the underlying Upstash
    // pipeline, preserving the fluent chainable interface.  This covers
    // hincrby, expire, hmget, and every other command the new telemetry
    // architecture (or future code) might call without requiring manual
    // enumeration.
    const builder: any = new Proxy(
      {
        async exec() {
          const results = await p.exec();
          if (!results) return null;
          // Normalise to the [error, value] tuple shape ioredis returns
          return results.map((res: any) => [null, res]);
        },
      },
      {
        get(target: any, prop: string) {
          // exec lives on the target object itself
          if (prop === "exec") return target.exec;

          // "object" is a known no-op for Upstash (OBJECT IDLETIME unsupported)
          if (prop === "object") return () => builder;

          // Every other property is forwarded to the Upstash pipeline
          if (typeof (p as any)[prop] === "function") {
            return (...args: any[]) => {
              (p as any)[prop](...args);
              return builder;
            };
          }

          return target[prop];
        },
      }
    );

    return builder;
  }
}

// =============================================================================
// standard TCP ioredis Driver Wrapper
// =============================================================================

class IORedisWrapper implements RedisClient {
  [key: string]: any;
  private client: IORedis;
  public status: string;

  constructor(url: string) {
    this.client = new IORedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      connectTimeout: 5_000,
      ...(url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {}),
      retryStrategy(times: number) {
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

  on(event: string, listener: (...args: any[]) => void) {
    this.client.on(event, listener);
    return this;
  }

  async ping() {
    return this.client.ping();
  }

  defineCommand(name: string, definition: { numberOfKeys: number; lua: string }) {
    this.client.defineCommand(name, definition);
    this[name] = (...args: any[]) => (this.client as any)[name](...args);
  }

  async hget(key: string, field: string) {
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string) {
    return this.client.hset(key, field, value);
  }

  async hdel(key: string, ...fields: string[]) {
    return this.client.hdel(key, ...fields);
  }

  async hgetall(key: string) {
    return this.client.hgetall(key);
  }

  async hlen(key: string) {
    return this.client.hlen(key);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async incr(key: string) {
    return this.client.incr(key);
  }

  async hmget(key: string, ...fields: string[]) {
    return this.client.hmget(key, ...fields);
  }

  async hmset(key: string, ...args: string[]) {
    return this.client.hmset(key, ...args);
  }

  async lpush(key: string, ...values: string[]) {
    return this.client.lpush(key, ...values);
  }

  async ltrim(key: string, start: number, stop: number) {
    return this.client.ltrim(key, start, stop);
  }

  async lrange(key: string, start: number, stop: number) {
    return this.client.lrange(key, start, stop);
  }

  async zcard(key: string) {
    return this.client.zcard(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async scan(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]> {
    return (this.client.scan as any)(cursor, ...args);
  }

  pipeline() {
    return this.client.pipeline();
  }
}

// Instantiate connection wrapper dynamically based on connection protocol
export const redis: RedisClient = useUpstash
  ? new UpstashRedisWrapper()
  : new IORedisWrapper(redisUrl);

// Support both named and default exports for maximum compatibility
export default redis;

// ---------------------------------------------------------------------------
// Event listeners — keep the process informed without crashing
// ---------------------------------------------------------------------------

redis.on("error", (err: any) => {
  logger.error({ err: err?.message || String(err) }, "Redis connection error");
});

redis.on("connect", () => {
  logger.info("Redis TCP connection established");
});

redis.on("ready", () => {
  logger.info("Redis client ready to accept commands");
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});

redis.on("reconnecting", (ms: number) => {
  logger.info({ inMs: ms }, "Redis reconnecting");
});

// =============================================================================
// Lua Script Boot-loader
// =============================================================================

const SCRIPTS_DIR = path.join(__dirname, "..", "scripts");

function parseNumberOfKeys(content: string): number {
  const match = content.match(/^--\s*KEYS:\s*(\d+)/m);
  return match ? parseInt(match[1]!, 10) : 1;
}

async function bootstrapLuaScripts(): Promise<string[]> {
  const registered: string[] = [];

  try {
    const entries = await fs.readdir(SCRIPTS_DIR);
    const luaFiles = entries.filter((f) => f.endsWith(".lua")).sort();

    if (luaFiles.length === 0) {
      logger.warn({ dir: SCRIPTS_DIR }, "No .lua scripts found in scripts directory");
      return registered;
    }

    for (const file of luaFiles) {
      const filePath = path.join(SCRIPTS_DIR, file);
      const content = await fs.readFile(filePath, "utf-8");
      const commandName = path.basename(file, ".lua");
      const numberOfKeys = parseNumberOfKeys(content);

      redis.defineCommand(commandName, {
        numberOfKeys,
        lua: content,
      });

      registered.push(commandName);
      logger.debug(
        { command: commandName, numberOfKeys, file },
        "Registered Lua script"
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, dir: SCRIPTS_DIR },
      "Failed to bootstrap Lua scripts"
    );
    throw err;
  }

  return registered;
}

// =============================================================================
// Background Metric Eviction Routine
// =============================================================================

let evictionIntervalId: NodeJS.Timeout | null = null;

async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  try {
    let cursor = "0";
    do {
      const result = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      if (!result || !Array.isArray(result)) break;
      const [nextCursor, batch] = result;
      cursor = nextCursor || "0";
      if (batch && Array.isArray(batch)) {
        keys.push(...batch);
      } else {
        break;
      }
    } while (cursor !== "0");
  } catch (err) {
    logger.error({ err, pattern }, "Error scanning keys during eviction");
  }
  return keys;
}

export async function evictExpiredOrStaleKeys(): Promise<number> {
  if (redis.status !== "ready") {
    logger.warn("Skipping eviction routine: Redis is not connected");
    return 0;
  }

  let evictedCount = 0;
  try {
    const keysToDelete: string[] = [];

    const patterns = ["rl:tb:*", "rl:sw:*", "rl:fw:*"];
    const allKeys: string[] = [];

    for (const pattern of patterns) {
      const keys = await scanKeys(pattern);
      allKeys.push(...keys);
    }

    if (allKeys.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of allKeys) {
        pipeline.ttl(key);
        pipeline.type(key);
      }

      const results = await pipeline.exec();
      if (results) {
        for (let i = 0; i < allKeys.length; i++) {
          const key = allKeys[i]!;
          const ttlResult = results[i * 2];
          const typeResult = results[i * 2 + 1];

          const ttl = ttlResult && Array.isArray(ttlResult) ? (ttlResult[1] as number) : -2;
          const type = typeResult && Array.isArray(typeResult) ? (typeResult[1] as string) : "none";

          if (ttl === -1) {
            keysToDelete.push(key);
            continue;
          }

          if (type === "zset") {
            const card = await redis.zcard(key);
            if (card === 0) {
              keysToDelete.push(key);
            }
          } else if (type === "hash") {
            const len = await redis.hlen(key);
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
    const statsKeys: string[] = [];
    for (const pattern of statsPatterns) {
      const keys = await scanKeys(pattern);
      statsKeys.push(...keys);
    }

    if (statsKeys.length > 0 && !useUpstash) {
      const MAX_IDLE_TIME_SECONDS = 300;
      const statsPipeline = redis.pipeline();
      for (const key of statsKeys) {
        statsPipeline.object("IDLETIME", key);
      }
      const idleResults = await statsPipeline.exec();
      if (idleResults) {
        for (let i = 0; i < statsKeys.length; i++) {
          const key = statsKeys[i]!;
          const idleResult = idleResults[i];
          const idleTime = idleResult && Array.isArray(idleResult) ? (idleResult[1] as number) : 0;

          if (idleTime > MAX_IDLE_TIME_SECONDS) {
            keysToDelete.push(key);
          }
        }
      }
    }

    if (keysToDelete.length > 0) {
      const deletePipeline = redis.pipeline();
      for (const key of keysToDelete) {
        deletePipeline.del(key);
      }
      await deletePipeline.exec();
      evictedCount = keysToDelete.length;
      logger.info({ evictedKeys: keysToDelete }, `Evicted ${evictedCount} stale rate limit / stats keys from Redis`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Failed to execute eviction routine");
  }

  return evictedCount;
}

export function startEvictionRoutine(intervalMs = 60_000): void {
  if (evictionIntervalId) {
    clearInterval(evictionIntervalId);
  }
  evictionIntervalId = setInterval(async () => {
    logger.debug("Executing background rate limit key eviction...");
    await evictExpiredOrStaleKeys();
  }, intervalMs);
  logger.info({ intervalMs }, "Background metric eviction routine started");
}

export function stopEvictionRoutine(): void {
  if (evictionIntervalId) {
    clearInterval(evictionIntervalId);
    evictionIntervalId = null;
    logger.info("Background metric eviction routine stopped");
  }
}

// =============================================================================
// Public API
// =============================================================================

export async function initRedis(): Promise<void> {
  try {
    await redis.connect();

    // Eagerly validate connectivity — crash loud at boot if Redis is
    // unreachable or credentials are wrong, instead of discovering it
    // silently on the first request.
    await redis.ping();
    logger.info("Redis PING succeeded — connection validated");

    const scripts = await bootstrapLuaScripts();
    logger.info(
      { scriptsRegistered: scripts.length, scripts },
      "✅ Redis connected and all Lua scripts boot-loaded successfully"
    );
    startEvictionRoutine();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message },
      "Redis initialization failed — service will operate in degraded mode (fail-open)"
    );
  }
}

export async function shutdownRedis(): Promise<void> {
  stopEvictionRoutine();
  await redis.quit();
  logger.info("Redis connection closed gracefully");
}

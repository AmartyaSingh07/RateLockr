export interface RedisClient {
    status: string;
    connect(): Promise<void>;
    quit(): Promise<string | void>;
    on(event: string, listener: (...args: any[]) => void): this;
    ping(): Promise<string>;
    defineCommand(name: string, definition: {
        numberOfKeys: number;
        lua: string;
    }): void;
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
export declare const redis: RedisClient;
export declare function evictExpiredOrStaleKeys(): Promise<number>;
export declare function startEvictionRoutine(intervalMs?: number): void;
export declare function stopEvictionRoutine(): void;
export declare function initRedis(): Promise<void>;
export declare function shutdownRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map
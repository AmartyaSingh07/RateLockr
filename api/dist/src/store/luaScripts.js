"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.luaScripts = void 0;
exports.luaScripts = {
    fixedWindow: {
        numberOfKeys: 1,
        lua: `-- KEYS: 1
-- =============================================================================
-- Fixed Window Counter Rate Limiter
-- =============================================================================
-- Implements an atomic fixed window using a standard Redis String counter.
-- Relies on native INCR and sets an EXPIRE TTL on the first request to map
-- the window bound dynamically.
--
-- ARGS:
-- 1. capacity             : max requests allowed within the window
-- 2. window_size_seconds  : window size in seconds
-- 3. cost                 : token cost of the request
--
-- RETURNS:
-- [ allowed (0|1), remaining ]
-- =============================================================================

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local window_size_seconds = tonumber(ARGV[2])
local cost = tonumber(ARGV[3]) or 1

-- Natively increment the counter
local current_count = redis.call('INCRBY', key, cost)

-- If this is the exact cost, it means the key was just created
if current_count == cost then
    redis.call('EXPIRE', key, window_size_seconds)
end

local allowed = 0
local remaining = capacity - current_count

if current_count <= capacity then
    allowed = 1
else
    -- Threshold breached: revert the increment to keep bounds clean
    redis.call('DECRBY', key, cost)
    -- Recalculate remaining to 0 or negative bounded
    remaining = capacity - (current_count - cost)
end

return { allowed, math.max(0, remaining) }`
    },
    slidingWindow: {
        numberOfKeys: 1,
        lua: `-- KEYS: 1
-- =============================================================================
-- Sliding Window Log Rate Limiter
-- =============================================================================
-- Implements an atomic sliding window using a Redis ZSET (Sorted Set).
-- Keys map to a specific client and endpoint. ZSET scores are timestamps in ms.
--
-- ARGS:
-- 1. capacity       : max requests allowed within the window
-- 2. window_size_ms : window size in milliseconds
-- 3. now_ms         : current Unix timestamp in ms
-- 4. member         : unique identifier for the request (e.g. UUID)
--
-- RETURNS:
-- [ allowed (0|1), remaining ]
-- =============================================================================

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local window_size_ms = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local member = ARGV[4]

local window_start = math.max(0, now_ms - window_size_ms)

-- Clear stale entries outside the current window
redis.call('ZREMRANGEBYSCORE', key, '-inf', '(' .. window_start)

-- Count the total remaining items in the window
local current_count = redis.call('ZCARD', key)

local allowed = 0
local remaining = math.max(0, capacity - current_count)

if current_count < capacity then
    allowed = 1
    -- Add the new unique request
    redis.call('ZADD', key, now_ms, member)
    remaining = remaining - 1
end

-- Refresh TTL to be the window size (plus a 1s buffer to ensure cleanup)
local ttl = math.ceil(window_size_ms / 1000) + 1
redis.call('EXPIRE', key, ttl)

return { allowed, remaining }`
    },
    tokenBucket: {
        numberOfKeys: 1,
        lua: `-- KEYS: 1
-- =============================================================================
-- Token Bucket Rate Limiter (Atomic)
-- =============================================================================
-- Implements a lazy-evaluated token bucket against a Redis Hash.
--
-- KEYS[1]  = rl:tb:{clientId}:{endpoint}
-- ARGV[1]  = capacity     — maximum tokens in the bucket
-- ARGV[2]  = refill_rate  — tokens restored per second
-- ARGV[3]  = now_ms       — current Unix timestamp in milliseconds
-- ARGV[4]  = cost         — tokens consumed per request (default 1)
--
-- Returns:  { allowed (0|1), remaining (integer) }
-- =============================================================================

local key         = KEYS[1]
local capacity    = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now_ms      = tonumber(ARGV[3])
local cost        = tonumber(ARGV[4]) or 1

-- ---------------------------------------------------------------------------
-- 1. Read current state from Hash (lazy initialization)
-- ---------------------------------------------------------------------------
local data        = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens      = tonumber(data[1]) or capacity
local last_refill = tonumber(data[2]) or now_ms

-- ---------------------------------------------------------------------------
-- 2. Calculate token refill based on elapsed time
-- ---------------------------------------------------------------------------
-- Clamp delta to >= 0 to guard against clock skew in distributed setups.
local delta_s  = math.max((now_ms - last_refill) / 1000, 0)
local refilled = tokens + (delta_s * refill_rate)
tokens         = math.min(refilled, capacity)

-- ---------------------------------------------------------------------------
-- 3. Attempt to consume tokens
-- ---------------------------------------------------------------------------
local allowed = 0
if tokens >= cost then
    tokens  = tokens - cost
    allowed = 1
end

-- ---------------------------------------------------------------------------
-- 4. Persist updated state back to Hash
-- ---------------------------------------------------------------------------
redis.call('HMSET', key, 'tokens', tostring(tokens), 'last_refill', tostring(now_ms))

-- ---------------------------------------------------------------------------
-- 5. Dynamic TTL — auto-expire idle keys to reclaim memory
--    Formula: (capacity / refill_rate) * 2 seconds
-- ---------------------------------------------------------------------------
local ttl = math.ceil((capacity / refill_rate) * 2)
redis.call('EXPIRE', key, ttl)

-- ---------------------------------------------------------------------------
-- 6. Return decision
-- ---------------------------------------------------------------------------
return { allowed, math.floor(tokens) }`
    }
};
//# sourceMappingURL=luaScripts.js.map
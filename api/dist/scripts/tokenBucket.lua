-- KEYS: 1
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
return { allowed, math.floor(tokens) }

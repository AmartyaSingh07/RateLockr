-- KEYS: 1
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

return { allowed, remaining }

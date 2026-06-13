-- KEYS: 1
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

return { allowed, math.max(0, remaining) }

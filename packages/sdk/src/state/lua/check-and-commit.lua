--[[
  Atomic Check-and-Commit Script
  
  Prevents race conditions in distributed enforcement:
  - Check budget limits
  - Check rate limits
  - Update state atomically
  - Return decision
  
  All operations are atomic - either ALL succeed or ALL fail.
  
  KEYS[1] = mandate:state:{agentId}:{mandateId}
  KEYS[2] = mandate:ratelimit:{agentId}:{mandateId}
  KEYS[3] = mandate:tool:ratelimit:{agentId}:{tool}
  
  ARGV[1] = action.id (string)
  ARGV[2] = action.idempotencyKey (string, optional)
  ARGV[3] = estimatedCost (number)
  ARGV[4] = costType (string: COGNITION | EXECUTION)
  ARGV[5] = maxCostPerCall (number, optional)
  ARGV[6] = maxCostTotal (number, optional)
  ARGV[7] = agentRateLimit.maxCalls (number, optional)
  ARGV[8] = agentRateLimit.windowMs (number, optional)
  ARGV[9] = toolRateLimit.maxCalls (number, optional)
  ARGV[10] = toolRateLimit.windowMs (number, optional)
  ARGV[11] = timestamp (number)
  ARGV[12] = mandate.expiresAt (number, optional)
  
  Returns:
  {
    "allowed": true/false,
    "reason": "...",
    "code": "...",
    "remainingCost": number,
    "remainingCalls": number
  }
]]

local stateKey = KEYS[1]
local rateLimitKey = KEYS[2]
local toolRateLimitKey = KEYS[3]

-- Copy ARGV values to local variables (ARGV is readonly)
local actionId = tostring(ARGV[1])
local idempotencyKey = tostring(ARGV[2] or '')
local estimatedCost = tonumber(ARGV[3]) or 0
local costType = tostring(ARGV[4] or 'EXECUTION')
local maxCostPerCall = ARGV[5] and tonumber(ARGV[5]) or nil
local maxCostTotal = ARGV[6] and tonumber(ARGV[6]) or nil
local agentMaxCalls = ARGV[7] and tonumber(ARGV[7]) or nil
local agentWindowMs = ARGV[8] and tonumber(ARGV[8]) or nil
local toolMaxCalls = ARGV[9] and tonumber(ARGV[9]) or nil
local toolWindowMs = ARGV[10] and tonumber(ARGV[10]) or nil
local timestamp = tonumber(ARGV[11]) or 0
local expiresAt = ARGV[12] and tonumber(ARGV[12]) or nil

-- Helper: Create response
local function createResponse(allowed, reason, code, remainingCost, remainingCalls)
  return cjson.encode({
    allowed = allowed,
    reason = reason,
    code = code,
    remainingCost = remainingCost,
    remainingCalls = remainingCalls
  })
end

-- 1. Check if state exists, create if not
local stateExists = redis.call('EXISTS', stateKey)
if stateExists == 0 then
  redis.call('HSET', stateKey,
    'cumulativeCost', '0',
    'cognitionCost', '0',
    'executionCost', '0',
    'callCount', '0',
    'windowStart', tostring(timestamp),
    'seenActionIds', '[]',
    'seenIdempotencyKeys', '[]',
    'killed', '0'
  )
end

-- Debug: Log script execution (remove in production)
-- redis.log(redis.LOG_NOTICE, 'checkAndCommit: actionId=' .. actionId .. ', estimatedCost=' .. tostring(estimatedCost))

-- 2. Check replay protection (action ID)
local seenActionIds = redis.call('HGET', stateKey, 'seenActionIds')
seenActionIds = cjson.decode(seenActionIds or '[]')

for _, id in ipairs(seenActionIds) do
  if id == actionId then
    return createResponse(false, 'Action ' .. actionId .. ' already executed (replay detected)', 'DUPLICATE_ACTION', nil, nil)
  end
end

-- 3. Check idempotency key (if provided)
if idempotencyKey ~= '' then
  local seenKeys = redis.call('HGET', stateKey, 'seenIdempotencyKeys')
  seenKeys = cjson.decode(seenKeys or '[]')
  
  for _, key in ipairs(seenKeys) do
    if key == idempotencyKey then
      return createResponse(false, 'Idempotency key already used', 'DUPLICATE_ACTION', nil, nil)
    end
  end
end

-- 4. Check cost limits
-- Use HINCRBYFLOAT to atomically get current value, then check
-- We read first just for logging, but the real atomic operation is HINCRBYFLOAT
local cumulativeCost = tonumber(redis.call('HGET', stateKey, 'cumulativeCost')) or 0

-- Per-call limit (check before increment)
if maxCostPerCall then
  local maxPerCall = tonumber(maxCostPerCall)
  if estimatedCost > maxPerCall then
    return createResponse(
      false,
      'Estimated cost ' .. estimatedCost .. ' exceeds per-call limit ' .. maxPerCall,
      'COST_LIMIT_EXCEEDED',
      nil,
      nil
    )
  end
end

-- Cumulative limit: Use HINCRBYFLOAT to atomically increment and get new value
-- CRITICAL: HINCRBYFLOAT is atomic - it reads, increments, and returns in one operation
-- This prevents the race condition where two scripts both read the same initial value
if maxCostTotal then
  local maxTotal = tonumber(maxCostTotal)
  
  -- CRITICAL: Use HINCRBYFLOAT to atomically increment and get the NEW value
  -- HINCRBYFLOAT is atomic - it reads current value, increments, and returns new value in ONE operation
  -- This prevents race conditions: if two scripts call HINCRBYFLOAT simultaneously:
  --   Script 1: HINCRBYFLOAT(0, 5.5) → returns 5.5
  --   Script 2: HINCRBYFLOAT(5.5, 5.5) → returns 11.0 (sees Script 1's increment!)
  local newCumulative = tonumber(redis.call('HINCRBYFLOAT', stateKey, 'cumulativeCost', estimatedCost))
  
  -- Debug: log state key and HINCRBYFLOAT result to verify both use same key
  redis.log(redis.LOG_WARNING, string.format('[LUA] stateKey=%s HINCRBYFLOAT returned: %.2f (was %.2f, added %.2f)', 
    stateKey, newCumulative, cumulativeCost, estimatedCost))
  
  -- Now check if we exceeded the limit
  if newCumulative > maxTotal then
    -- Rollback the increment (atomic operation)
    local rolledBack = tonumber(redis.call('HINCRBYFLOAT', stateKey, 'cumulativeCost', -estimatedCost))
    redis.log(redis.LOG_WARNING, string.format('[LUA] BLOCKED: newCost=%.2f > maxTotal=%.2f (rolled back to %.2f)', newCumulative, maxTotal, rolledBack))
    return createResponse(
      false,
      'Cumulative cost ' .. newCumulative .. ' would exceed limit ' .. maxTotal .. ' (current before increment: ' .. (newCumulative - estimatedCost) .. ')',
      'COST_LIMIT_EXCEEDED',
      math.max(0, maxTotal - (newCumulative - estimatedCost)),
      nil
    )
  end
  
  -- Check passed - value already incremented
  cumulativeCost = newCumulative
  redis.log(redis.LOG_WARNING, string.format('[LUA] ALLOWED: incremented to %.2f', cumulativeCost))
else
  -- No total limit, but still need to increment for tracking
  cumulativeCost = tonumber(redis.call('HINCRBYFLOAT', stateKey, 'cumulativeCost', estimatedCost))
end

-- 5. Check agent-level rate limit
local callCount = tonumber(redis.call('HGET', stateKey, 'callCount')) or 0
local windowStart = tonumber(redis.call('HGET', stateKey, 'windowStart')) or timestamp

if agentMaxCalls and agentWindowMs then
  local windowEnd = windowStart + agentWindowMs
  
  -- Window still active
  if timestamp < windowEnd then
    if callCount >= agentMaxCalls then
      local retryAfter = windowEnd - timestamp
      return createResponse(
        false,
        'Rate limit exceeded: ' .. callCount .. '/' .. agentMaxCalls .. ' in ' .. agentWindowMs .. 'ms',
        'RATE_LIMIT_EXCEEDED',
        nil,
        0
      )
    end
  else
    -- Window expired - will be reset below
    windowStart = timestamp
    callCount = 0
  end
end

-- 6. Check tool-specific rate limit (using sorted set)
if toolMaxCalls and toolWindowMs then
  -- Remove expired entries
  local windowStart = timestamp - toolWindowMs
  redis.call('ZREMRANGEBYSCORE', toolRateLimitKey, '-inf', windowStart)
  
  -- Count calls in current window
  local toolCallCount = redis.call('ZCOUNT', toolRateLimitKey, windowStart, '+inf')
  
  if toolCallCount >= toolMaxCalls then
    return createResponse(
      false,
      'Tool rate limit exceeded: ' .. toolCallCount .. '/' .. toolMaxCalls .. ' in ' .. toolWindowMs .. 'ms',
      'RATE_LIMIT_EXCEEDED',
      nil,
      0
    )
  end
end

-- 7. All checks passed - STATE ALREADY UPDATED ATOMICALLY
-- Note: cumulativeCost was already incremented atomically above using HINCRBYFLOAT
-- No need to update again here

if costType == 'COGNITION' then
  local cognitionCost = tonumber(redis.call('HGET', stateKey, 'cognitionCost')) or 0
  redis.call('HSET', stateKey, 'cognitionCost', tostring(cognitionCost + estimatedCost))
elseif costType == 'EXECUTION' then
  local executionCost = tonumber(redis.call('HGET', stateKey, 'executionCost')) or 0
  redis.call('HSET', stateKey, 'executionCost', tostring(executionCost + estimatedCost))
end

-- Record action ID
table.insert(seenActionIds, actionId)
redis.call('HSET', stateKey, 'seenActionIds', cjson.encode(seenActionIds))

-- Record idempotency key (if provided)
if idempotencyKey ~= '' then
  local seenKeys = redis.call('HGET', stateKey, 'seenIdempotencyKeys')
  seenKeys = cjson.decode(seenKeys or '[]')
  table.insert(seenKeys, idempotencyKey)
  redis.call('HSET', stateKey, 'seenIdempotencyKeys', cjson.encode(seenKeys))
end

-- Update call count and window
redis.call('HSET', stateKey, 'callCount', tostring(callCount + 1))
redis.call('HSET', stateKey, 'windowStart', tostring(windowStart))

-- Update tool rate limit (add to sorted set)
if toolMaxCalls and toolWindowMs then
  redis.call('ZADD', toolRateLimitKey, timestamp, actionId)
  -- Set TTL to 2x window size (in seconds) for automatic cleanup
  local ttlSeconds = math.ceil((toolWindowMs * 2) / 1000)
  redis.call('EXPIRE', toolRateLimitKey, ttlSeconds)
end

-- Calculate remaining (use the cumulativeCost from the if/else block above)
-- Note: cumulativeCost is scoped within the if/else, so we need to get it from Redis
local finalCumulativeCost = tonumber(redis.call('HGET', stateKey, 'cumulativeCost')) or 0
local remainingCost = maxCostTotal and (tonumber(maxCostTotal) - finalCumulativeCost) or nil
local remainingCalls = agentMaxCalls and (agentMaxCalls - callCount - 1) or nil

-- Set TTL on state key if mandate has expiration
if expiresAt then
  local now = timestamp
  local timeUntilExpiry = expiresAt - now
  
  if timeUntilExpiry > 0 then
    local ttlSeconds = math.ceil(timeUntilExpiry / 1000) + 3600 -- +1 hour buffer
    -- Minimum 1 hour
    ttlSeconds = math.max(ttlSeconds, 3600)
    redis.call('EXPIRE', stateKey, ttlSeconds)
  else
    -- Already expired, set minimum TTL
    redis.call('EXPIRE', stateKey, 3600)
  end
end

return createResponse(true, 'All checks passed', nil, remainingCost, remainingCalls)


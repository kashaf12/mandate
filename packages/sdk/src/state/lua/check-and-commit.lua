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

local actionId = ARGV[1]
local idempotencyKey = ARGV[2]
local estimatedCost = tonumber(ARGV[3]) or 0
local costType = ARGV[4]
local maxCostPerCall = tonumber(ARGV[5])
local maxCostTotal = tonumber(ARGV[6])
local agentMaxCalls = tonumber(ARGV[7])
local agentWindowMs = tonumber(ARGV[8])
local toolMaxCalls = tonumber(ARGV[9])
local toolWindowMs = tonumber(ARGV[10])
local timestamp = tonumber(ARGV[11])

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
local cumulativeCost = tonumber(redis.call('HGET', stateKey, 'cumulativeCost')) or 0

-- Per-call limit
if maxCostPerCall and estimatedCost > maxCostPerCall then
  return createResponse(
    false,
    'Estimated cost ' .. estimatedCost .. ' exceeds per-call limit ' .. maxCostPerCall,
    'COST_LIMIT_EXCEEDED',
    nil,
    nil
  )
end

-- Cumulative limit
if maxCostTotal then
  local newCumulative = cumulativeCost + estimatedCost
  if newCumulative > maxCostTotal then
    return createResponse(
      false,
      'Cumulative cost ' .. newCumulative .. ' would exceed limit ' .. maxCostTotal,
      'COST_LIMIT_EXCEEDED',
      maxCostTotal - cumulativeCost,
      nil
    )
  end
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

-- 7. All checks passed - UPDATE STATE ATOMICALLY

-- Update costs
local newCumulativeCost = cumulativeCost + estimatedCost
redis.call('HSET', stateKey, 'cumulativeCost', tostring(newCumulativeCost))

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
end

-- Calculate remaining
local remainingCost = maxCostTotal and (maxCostTotal - newCumulativeCost) or nil
local remainingCalls = agentMaxCalls and (agentMaxCalls - callCount - 1) or nil

return createResponse(true, 'All checks passed', nil, remainingCost, remainingCalls)


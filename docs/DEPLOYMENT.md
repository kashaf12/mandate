# Mandate SDK - Deployment Guide

**Production deployment guide for Mandate SDK Phase 3: Distributed Coordination**

---

## Table of Contents

- [Single vs Distributed Setup](#single-vs-distributed-setup)
- [Redis Configuration](#redis-configuration)
- [Production Checklist](#production-checklist)
- [Performance Tuning](#performance-tuning)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)

---

## Single vs Distributed Setup

### When to Use Single Process (MemoryStateManager)

**Use MemoryStateManager when:**

- ✅ Single Node.js process
- ✅ Development/testing
- ✅ No need for persistence
- ✅ No cross-process coordination

**Configuration:**

```typescript
// No config needed - auto-selects MemoryStateManager
const client = new MandateClient({
  mandate: {
    /* ... */
  },
});
```

**Limitations:**

- State resets on process restart
- Not shared across multiple processes
- No persistence

### When to Use Distributed (RedisStateManager)

**Use RedisStateManager when:**

- ✅ Multiple processes/servers
- ✅ Need global per-agent limits
- ✅ Require state persistence
- ✅ Need distributed kill switch
- ✅ Production deployment

**Configuration:**

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  stateManager: {
    type: "redis",
    redis: {
      host: "redis.example.com",
      port: 6379,
      password: process.env.REDIS_PASSWORD,
      keyPrefix: "prod:mandate:",
    },
  },
});
```

---

## Redis Configuration

### Option 1: Docker Compose (Development)

**File: `docker-compose.yml`**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis-data:
```

**Start:**

```bash
docker compose up -d
```

**Stop:**

```bash
docker compose down
```

### Option 2: AWS ElastiCache

**Configuration:**

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  stateManager: {
    type: "redis",
    redis: {
      host: "your-cluster.xxxxx.cache.amazonaws.com",
      port: 6379,
      password: process.env.REDIS_PASSWORD,
      keyPrefix: "prod:mandate:",
      // ElastiCache-specific
      connectTimeout: 10000,
      commandTimeout: 5000,
      maxRetries: 5,
    },
  },
});
```

**Best Practices:**

- Use ElastiCache Redis (not Memcached)
- Enable encryption in transit
- Use VPC security groups
- Enable automatic failover
- Set up backup/restore

### Option 3: Redis Cloud (Redis Labs)

**Configuration:**

```typescript
// Use REDIS_URL from Redis Cloud dashboard
process.env.REDIS_URL = "redis://:password@host:port";

const client = new MandateClient({
  mandate: {
    /* ... */
  },
  // Auto-detects Redis from REDIS_URL
});
```

**Or explicit config:**

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  stateManager: {
    type: "redis",
    redis: {
      host: "your-redis-cloud-host",
      port: 12345,
      password: process.env.REDIS_PASSWORD,
      keyPrefix: "prod:mandate:",
    },
  },
});
```

### Option 4: Redis Cluster (High Availability)

**Configuration:**

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  stateManager: {
    type: "redis",
    redis: {
      cluster: true,
      clusterNodes: [
        { host: "redis-1.example.com", port: 6379 },
        { host: "redis-2.example.com", port: 6379 },
        { host: "redis-3.example.com", port: 6379 },
      ],
      password: process.env.REDIS_PASSWORD,
      keyPrefix: "prod:mandate:",
    },
  },
});
```

**Requirements:**

- Redis 5.0+ with cluster mode enabled
- All nodes accessible from application
- Consistent key prefix across all nodes

### Environment Variables

**Recommended:**

```bash
# .env
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
REDIS_DB=0
REDIS_KEY_PREFIX=prod:mandate:

# Or use REDIS_URL
REDIS_URL=redis://:password@redis.example.com:6379/0
```

**Code:**

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  stateManager: {
    type: "redis",
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || "0", 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || "mandate:",
    },
  },
});
```

---

## Production Checklist

### Pre-Deployment

- [ ] Redis instance provisioned and accessible
- [ ] Redis password set and stored securely
- [ ] Key prefix configured (e.g., `prod:mandate:`)
- [ ] Connection timeouts configured appropriately
- [ ] Retry strategy configured
- [ ] Health checks enabled

### Security

- [ ] Redis password authentication enabled
- [ ] TLS/SSL enabled (if supported)
- [ ] Network access restricted (firewall/VPC)
- [ ] Key prefix prevents namespace collisions
- [ ] Environment variables stored securely (not in code)

### Monitoring

- [ ] Redis connection monitoring
- [ ] Budget enforcement metrics
- [ ] Kill switch propagation tracking
- [ ] Error rate monitoring
- [ ] Latency tracking

### Testing

- [ ] Integration tests pass with Redis
- [ ] Multi-process budget enforcement verified
- [ ] Kill switch propagation tested
- [ ] Failover scenarios tested
- [ ] Performance benchmarks met

---

## Performance Tuning

### Redis Connection Pooling

**Default (single connection):**

```typescript
// One connection per MandateClient instance
const client = new MandateClient({
  /* ... */
});
```

**Connection reuse:**

```typescript
// Reuse same Redis instance across clients
import { createDistributedStateManager } from "@mandate/sdk";

const sharedStateManager = createDistributedStateManager(process.env.REDIS_URL);

const client1 = new MandateClient({
  mandate: mandate1,
  stateManager: sharedStateManager,
});

const client2 = new MandateClient({
  mandate: mandate2,
  stateManager: sharedStateManager,
});
```

### Timeout Configuration

**Development:**

```typescript
redis: {
  connectTimeout: 5000,  // 5 seconds
  commandTimeout: 1000, // 1 second
  maxRetries: 3,
}
```

**Production:**

```typescript
redis: {
  connectTimeout: 10000, // 10 seconds (network latency)
  commandTimeout: 5000,  // 5 seconds (Lua script execution)
  maxRetries: 5,         // More retries for resilience
}
```

### Redis Persistence

**Enable AOF (Append-Only File):**

```yaml
# docker-compose.yml
command: redis-server --appendonly yes
```

**Or in redis.conf:**

```
appendonly yes
appendfsync everysec
```

**Benefits:**

- State survives Redis restarts
- Budget tracking persists
- Kill switch state preserved

### Memory Management

**Monitor Redis memory:**

```bash
redis-cli INFO memory
```

**Set max memory:**

```yaml
# docker-compose.yml
command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
```

**Key expiration (optional):**

```typescript
// State keys don't expire by default
// Add TTL if needed for cleanup
```

---

## Monitoring

### Key Metrics

**Redis Connection:**

- Connection status
- Connection errors
- Reconnection attempts
- Latency (p50, p95, p99)

**Budget Enforcement:**

- Total budget checks
- Budget blocks (COST_LIMIT_EXCEEDED)
- Average budget per agent
- Budget utilization rate

**Kill Switch:**

- Kill signals broadcast
- Kill callbacks triggered
- Kill propagation latency

**Performance:**

- Lua script execution time
- Redis command latency
- State read/write operations

### Example Monitoring Code

```typescript
import { MandateClient } from "@mandate/sdk";

const client = new MandateClient({
  mandate: {
    /* ... */
  },
  stateManager: {
    type: "redis",
    redis: {
      host: "redis.example.com",
      port: 6379,
    },
  },
});

// Monitor connection
client.on("error", (err) => {
  console.error("[Mandate] Redis error:", err);
  // Send to monitoring service
});

// Monitor budget
const cost = await client.getCurrentCost();
console.log(`[Mandate] Current cost: $${cost.toFixed(2)}`);
```

### Redis Monitoring Commands

**Check connection:**

```bash
redis-cli PING
# Should return: PONG
```

**Monitor commands:**

```bash
redis-cli MONITOR
```

**Check keys:**

```bash
redis-cli KEYS "mandate:*"
```

**Get key info:**

```bash
redis-cli HGETALL "mandate:state:agent-1:mandate-1"
```

---

## Troubleshooting

### Connection Issues

**"Connection refused"**

```bash
# Check Redis is running
docker ps | grep redis

# Check port is accessible
telnet localhost 6379

# Check firewall rules
```

**"Authentication required"**

```typescript
// Ensure password is set
redis: {
  password: process.env.REDIS_PASSWORD, // Required if Redis has password
}
```

**"Connection timeout"**

```typescript
// Increase timeout
redis: {
  connectTimeout: 10000, // 10 seconds
}
```

### State Issues

**"Both processes succeed (should be one blocked)"**

- Verify both processes use **same mandate ID**
- Check they connect to **same Redis instance**
- Ensure `mandate.id` is set explicitly

```typescript
// ❌ Wrong
const mandate = MandateTemplates.production("user@example.com");
// Each process gets different mandate.id

// ✅ Correct
const mandate = MandateTemplates.production("user@example.com");
mandate.id = "shared-mandate-id"; // Explicit ID
```

**"State not persisting"**

- Check Redis persistence is enabled (AOF)
- Verify keys exist: `redis-cli KEYS "mandate:*"`
- Check key prefix matches

### Kill Switch Issues

**"Kill signal not propagating"**

- Verify Redis Pub/Sub: `redis-cli PUBSUB CHANNELS`
- Check all processes use same `keyPrefix`
- Ensure `onKill()` registered before `kill()`

```typescript
// Register callback first
await client.onKill((reason) => {
  console.log(`Killed: ${reason}`);
});

// Then kill
await client.kill("Emergency stop");
```

### Performance Issues

**"Slow budget checks"**

- Check Redis latency: `redis-cli --latency`
- Monitor Lua script execution time
- Consider Redis Cluster for scale

**"High memory usage"**

- Monitor: `redis-cli INFO memory`
- Set max memory: `--maxmemory 2gb`
- Use key expiration if needed

---

## Migration Guide

### From Phase 2 (Memory) to Phase 3 (Redis)

**Step 1: Install Dependencies**

```bash
pnpm add ioredis
```

**Step 2: Update Client Configuration**

```typescript
// Before (Phase 2)
const client = new MandateClient({
  mandate: {
    /* ... */
  },
});

// After (Phase 3)
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  stateManager: {
    type: "redis",
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },
  },
});
```

**Step 3: Update Async Calls**

```typescript
// Before (Phase 2 - synchronous)
const cost = client.getCost();
const killed = client.isKilled();

// After (Phase 3 - asynchronous)
const cost = await client.getCurrentCost();
const killed = await client.isKilled();
```

**Step 4: Register Kill Callbacks**

```typescript
// Phase 3: Register callback for distributed kill
await client.onKill((reason) => {
  console.log(`Killed: ${reason}`);
  // Cleanup and exit
  process.exit(0);
});
```

**Step 5: Close Connections**

```typescript
// Phase 3: Clean up Redis connections
await client.close();
```

**Step 6: Update Tests**

```typescript
// Before
it("should track cost", () => {
  const cost = client.getCost();
  expect(cost).toBe(5.0);
});

// After
it("should track cost", async () => {
  const cost = await client.getCurrentCost();
  expect(cost).toBe(5.0);
});
```

### Rollback Plan

**If Redis issues occur:**

1. Remove `stateManager` config (falls back to MemoryStateManager)
2. Update async calls back to sync (if needed)
3. Restart services

**Note:** State will reset (in-memory only), but service continues to work.

---

## Additional Resources

- [SDK README](../packages/sdk/README.md) - Full API documentation
- [Examples](../packages/examples) - Working examples
- [Architecture Guide](./ARCHITECTURE.md) - System design
- [Vision](./VISION.md) - Project goals

---

## Support

**Issues:** [GitHub Issues](https://github.com/kashaf12/mandate/issues)

**Discussions:** [GitHub Discussions](https://github.com/kashaf12/mandate/discussions)

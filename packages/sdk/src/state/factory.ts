import type { StateManager, StateManagerConfig } from "./types";
import { MemoryStateManager } from "./memory";
import { RedisStateManager } from "./redis";

/**
 * Create StateManager based on configuration.
 *
 * Auto-detects:
 * - If config.redis provided → RedisStateManager (distributed)
 * - Otherwise → MemoryStateManager (local)
 *
 * Zero config for single-process deployment.
 */
export function createStateManager(config?: StateManagerConfig): StateManager {
  // No config → memory (Phase 1/2 behavior)
  if (!config) {
    return new MemoryStateManager();
  }

  // Explicit type
  if (config.type === "memory") {
    return new MemoryStateManager();
  }

  if (config.type === "redis") {
    if (!config.redis) {
      throw new Error('Redis config required when type="redis"');
    }
    return new RedisStateManager(config.redis);
  }

  // Auto-detect from presence of redis config
  if (config.redis) {
    return new RedisStateManager(config.redis);
  }

  // Default to memory
  return new MemoryStateManager();
}

/**
 * Convenience: Create distributed StateManager with Redis.
 */
export function createDistributedStateManager(redisUrl?: string): StateManager {
  if (!redisUrl) {
    redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  }

  // Parse Redis URL
  const url = new URL(redisUrl);

  return new RedisStateManager({
    host: url.hostname,
    port: parseInt(url.port, 10) || 6379,
    password: url.password || undefined,
    db: parseInt(url.pathname.slice(1), 10) || 0,
  });
}

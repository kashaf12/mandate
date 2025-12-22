import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createStateManager,
  createDistributedStateManager,
} from "../../src/state/factory";
import { MemoryStateManager } from "../../src/state/memory";
import { RedisStateManager } from "../../src/state/redis";

describe("StateManager Factory", () => {
  describe("createStateManager", () => {
    it("creates MemoryStateManager by default", () => {
      const manager = createStateManager();
      expect(manager).toBeInstanceOf(MemoryStateManager);
    });

    it("creates MemoryStateManager when type='memory'", () => {
      const manager = createStateManager({ type: "memory" });
      expect(manager).toBeInstanceOf(MemoryStateManager);
    });

    it("creates RedisStateManager when type='redis'", async () => {
      const manager = createStateManager({
        type: "redis",
        redis: { host: "localhost", port: 6379 },
      });
      expect(manager).toBeInstanceOf(RedisStateManager);
      await manager.close(); // Cleanup
    });

    it("auto-detects Redis from config", async () => {
      const manager = createStateManager({
        redis: { host: "localhost", port: 6379 },
      } as any);
      expect(manager).toBeInstanceOf(RedisStateManager);
      await manager.close();
    });

    it("throws when type='redis' but no redis config", () => {
      expect(() => {
        createStateManager({ type: "redis" });
      }).toThrow("Redis config required");
    });
  });

  describe("createDistributedStateManager", () => {
    it("creates RedisStateManager from URL", async () => {
      const manager = createDistributedStateManager("redis://localhost:6379");
      expect(manager).toBeInstanceOf(RedisStateManager);
      await manager.close();
    });

    it("uses REDIS_URL env var if not provided", async () => {
      const originalEnv = process.env.REDIS_URL;
      process.env.REDIS_URL = "redis://localhost:6379";
      const manager = createDistributedStateManager();
      expect(manager).toBeInstanceOf(RedisStateManager);
      await manager.close();
      if (originalEnv) {
        process.env.REDIS_URL = originalEnv;
      } else {
        delete process.env.REDIS_URL;
      }
    });

    it("defaults to localhost:6379", async () => {
      const originalEnv = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      const manager = createDistributedStateManager();
      expect(manager).toBeInstanceOf(RedisStateManager);
      await manager.close();
      if (originalEnv) {
        process.env.REDIS_URL = originalEnv;
      }
    });
  });
});

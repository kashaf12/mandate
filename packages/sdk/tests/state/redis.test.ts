import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { RedisStateManager } from "../../src/state/redis";
import type { Action } from "../../src/types";

// Test requires Redis running on localhost:6379
// Run: docker compose up -d

describe("RedisStateManager", () => {
  let manager: RedisStateManager;

  beforeAll(async () => {
    // Verify Redis is accessible
    try {
      manager = new RedisStateManager({
        host: "localhost",
        port: 6379,
        keyPrefix: "test:mandate:",
      });
      await manager.get("test", "test"); // Test connection
    } catch (error) {
      console.error("Redis not accessible. Run: docker compose up -d");
      throw error;
    }
  });

  beforeEach(async () => {
    manager = new RedisStateManager({
      host: "localhost",
      port: 6379,
      keyPrefix: "test:mandate:",
    });
  });

  afterEach(async () => {
    // Cleanup test keys
    await manager.remove("agent-1");
    await manager.remove("agent-2");
    await manager.close();
  });

  describe("get", () => {
    it("creates default state for new agent", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      expect(state.agentId).toBe("agent-1");
      expect(state.mandateId).toBe("mandate-1");
      expect(state.cumulativeCost).toBe(0);
      expect(state.callCount).toBe(0);
      expect(state.killed).toBe(false);
    });

    it("retrieves existing state", async () => {
      const state1 = await manager.get("agent-1", "mandate-1");
      state1.cumulativeCost = 5.0;

      // Save the state first so commitSuccess can read it
      const key = `test:mandate:state:agent-1:mandate-1`;
      await manager["saveState"](key, state1);

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 0.5,
        costType: "EXECUTION",
      };

      await manager.commitSuccess(action, state1);

      const state2 = await manager.get("agent-1", "mandate-1");
      expect(state2.cumulativeCost).toBe(5.5);
    });
  });

  describe("commitSuccess", () => {
    it("updates cumulative cost", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 0.5,
        costType: "EXECUTION",
      };

      await manager.commitSuccess(action, state);

      const updated = await manager.get("agent-1", "mandate-1");
      expect(updated.cumulativeCost).toBe(0.5);
      expect(updated.executionCost).toBe(0.5);
    });

    it("records action ID", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        costType: "EXECUTION",
      };

      await manager.commitSuccess(action, state);

      const updated = await manager.get("agent-1", "mandate-1");
      expect(updated.seenActionIds.has("action-1")).toBe(true);
    });

    describe("Rate Limit Window Management", () => {
      it("resets agent window when expired", async () => {
        const state = await manager.get("agent-1", "mandate-1");
        const rateLimit = { maxCalls: 100, windowMs: 60000 };

        // Set expired window in Redis
        const key = `test:mandate:state:agent-1:mandate-1`;
        state.callCount = 50;
        state.windowStart = Date.now() - 70000; // 70 seconds ago (expired)
        await manager["saveState"](key, state);

        const action: Action = {
          type: "tool_call",
          id: "action-1",
          agentId: "agent-1",
          timestamp: Date.now(),
          tool: "read_file",
        };

        await manager.commitSuccess(action, state, undefined, rateLimit);

        const updated = await manager.get("agent-1", "mandate-1");
        expect(updated.callCount).toBe(1); // Reset
        expect(updated.windowStart).toBeGreaterThan(Date.now() - 1000);
      });

      it("does not reset window when still active", async () => {
        const state = await manager.get("agent-1", "mandate-1");
        const rateLimit = { maxCalls: 100, windowMs: 60000 };

        const windowStart = Date.now() - 30000; // 30 seconds ago (still active)
        state.callCount = 50;
        state.windowStart = windowStart;
        const key = `test:mandate:state:agent-1:mandate-1`;
        await manager["saveState"](key, state);

        const action: Action = {
          type: "tool_call",
          id: "action-1",
          agentId: "agent-1",
          timestamp: Date.now(),
          tool: "read_file",
        };

        await manager.commitSuccess(action, state, undefined, rateLimit);

        const updated = await manager.get("agent-1", "mandate-1");
        expect(updated.callCount).toBe(51); // Incremented
        // Window start should remain the same (within 1 second tolerance)
        expect(Math.abs(updated.windowStart - windowStart)).toBeLessThan(1000);
      });

      it("resets tool window when expired", async () => {
        const state = await manager.get("agent-1", "mandate-1");
        const toolRateLimit = { maxCalls: 10, windowMs: 60000 };

        // Set expired tool window
        state.toolCallCounts.send_email = {
          count: 5,
          windowStart: Date.now() - 70000, // 70 seconds ago (expired)
        };
        const key = `test:mandate:state:agent-1:mandate-1`;
        await manager["saveState"](key, state);

        const action: Action = {
          type: "tool_call",
          id: "action-1",
          agentId: "agent-1",
          timestamp: Date.now(),
          tool: "send_email",
        };

        await manager.commitSuccess(
          action,
          state,
          undefined,
          undefined,
          toolRateLimit
        );

        const updated = await manager.get("agent-1", "mandate-1");
        expect(updated.toolCallCounts.send_email.count).toBe(1); // Reset
        expect(updated.toolCallCounts.send_email.windowStart).toBeGreaterThan(
          Date.now() - 1000
        );
      });

      it("increments tool window when active", async () => {
        const state = await manager.get("agent-1", "mandate-1");
        const toolRateLimit = { maxCalls: 10, windowMs: 60000 };

        const windowStart = Date.now() - 30000; // 30 seconds ago (still active)
        state.toolCallCounts.send_email = {
          count: 5,
          windowStart,
        };
        const key = `test:mandate:state:agent-1:mandate-1`;
        await manager["saveState"](key, state);

        const action: Action = {
          type: "tool_call",
          id: "action-1",
          agentId: "agent-1",
          timestamp: Date.now(),
          tool: "send_email",
        };

        await manager.commitSuccess(
          action,
          state,
          undefined,
          undefined,
          toolRateLimit
        );

        const updated = await manager.get("agent-1", "mandate-1");
        expect(updated.toolCallCounts.send_email.count).toBe(6); // Incremented
        expect(updated.toolCallCounts.send_email.windowStart).toBe(windowStart);
      });

      it("handles multiple rate limit windows correctly", async () => {
        const state = await manager.get("agent-1", "mandate-1");
        const agentRateLimit = { maxCalls: 100, windowMs: 60000 };
        const toolRateLimit = { maxCalls: 10, windowMs: 30000 };

        // Set both windows expired
        state.callCount = 50;
        state.windowStart = Date.now() - 70000; // Expired
        state.toolCallCounts.send_email = {
          count: 5,
          windowStart: Date.now() - 40000, // Expired
        };
        const key = `test:mandate:state:agent-1:mandate-1`;
        await manager["saveState"](key, state);

        const action: Action = {
          type: "tool_call",
          id: "action-1",
          agentId: "agent-1",
          timestamp: Date.now(),
          tool: "send_email",
        };

        await manager.commitSuccess(
          action,
          state,
          undefined,
          agentRateLimit,
          toolRateLimit
        );

        const updated = await manager.get("agent-1", "mandate-1");
        expect(updated.callCount).toBe(1); // Agent window reset
        expect(updated.toolCallCounts.send_email.count).toBe(1); // Tool window reset
      });
    });
  });

  describe("kill", () => {
    it("marks agent as killed", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      await manager.kill(state, "Test kill");

      const updated = await manager.get("agent-1", "mandate-1");
      expect(updated.killed).toBe(true);
      expect(updated.killedReason).toBe("Test kill");
    });
  });

  describe("isKilled", () => {
    it("returns false for non-killed agent", async () => {
      await manager.get("agent-1", "mandate-1"); // Create state

      const killed = await manager.isKilled("agent-1", "mandate-1");
      expect(killed).toBe(false);
    });

    it("returns true for killed agent", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      await manager.kill(state, "Test");

      const killed = await manager.isKilled("agent-1", "mandate-1");
      expect(killed).toBe(true);
    });
  });

  describe("remove", () => {
    it("removes agent state", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      state.cumulativeCost = 10.0;

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 10.0,
        costType: "EXECUTION",
      };

      await manager.commitSuccess(action, state);
      await manager.remove("agent-1");

      const newState = await manager.get("agent-1", "mandate-1");
      expect(newState.cumulativeCost).toBe(0); // Fresh state
    });
  });

  describe("TTL (Time To Live)", () => {
    it("does not set TTL on state keys by default", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const key = `test:mandate:state:agent-1:mandate-1`;

      // Access Redis client to check TTL
      const redis = (manager as any).redis;
      const ttl = await redis.ttl(key);

      // -1 means no expiration set
      expect(ttl).toBe(-1);
    });

    it("should set TTL on state key when mandate has expiration", async () => {
      // Remove any existing state first
      await manager.remove("agent-1");

      const mandate = {
        id: "mandate-1",
        version: 1,
        agentId: "agent-1",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      // Create state with mandate to set TTL
      const state = await manager.get("agent-1", "mandate-1");
      const key = `test:mandate:state:agent-1:mandate-1`;
      await manager["saveState"](key, state, mandate);

      const redis = (manager as any).redis;
      const ttl = await redis.ttl(key);

      // Should have TTL set (greater than 0)
      expect(ttl).toBeGreaterThan(0);
      // TTL should be approximately 1 hour + buffer (within 5 minutes tolerance)
      // expiresAt is 1 hour from now, so TTL = 1 hour + 1 hour buffer = 2 hours (7200 seconds)
      expect(ttl).toBeGreaterThanOrEqual(3600); // At least 1 hour
      expect(ttl).toBeLessThanOrEqual(7300); // Less than or equal to ~2 hours (with small tolerance)
    });

    it("should refresh TTL when state is updated", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const mandate = {
        id: "mandate-1",
        version: 1,
        agentId: "agent-1",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      const key = `test:mandate:state:agent-1:mandate-1`;
      await manager["saveState"](key, state, mandate);

      const redis = (manager as any).redis;
      const ttl1 = await redis.ttl(key);

      // Wait a bit and update state
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 0.5,
        costType: "EXECUTION",
      };

      await manager.commitSuccess(
        action,
        state,
        undefined,
        undefined,
        undefined,
        mandate
      );

      const ttl2 = await redis.ttl(key);

      // TTL should be refreshed (approximately same or slightly less)
      expect(ttl2).toBeGreaterThan(0);
      // TTL should be refreshed, so it should be close to original (within 2 seconds)
      expect(Math.abs(ttl2 - ttl1)).toBeLessThan(2);
    });

    it("should set TTL on tool rate limit sorted sets", async () => {
      // Tool rate limit keys are created in the Lua script
      const toolRateLimit = { maxCalls: 10, windowMs: 60000 }; // 1 minute window

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.1,
        costType: "EXECUTION",
      };

      const mandate = {
        id: "mandate-1",
        version: 1,
        agentId: "agent-1",
        issuedAt: Date.now(),
        toolPolicies: {
          send_email: {
            rateLimit: toolRateLimit,
          },
        },
      };

      // Use checkAndCommit to create tool rate limit key
      await manager.checkAndCommit(action, mandate);

      const toolRateLimitKey = `test:mandate:tool:ratelimit:agent-1:send_email`;
      const redis = (manager as any).redis;
      const ttl = await redis.ttl(toolRateLimitKey);

      // Should have TTL set (greater than 0)
      // TTL should be approximately 2x window size (120 seconds for 60s window)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeGreaterThan(60); // At least 1 minute
      expect(ttl).toBeLessThan(180); // Less than 3 minutes (2x window + buffer)
    });

    it("should not set TTL when mandate has no expiration", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const mandate = {
        id: "mandate-1",
        version: 1,
        agentId: "agent-1",
        issuedAt: Date.now(),
        // No expiresAt
      };

      const key = `test:mandate:state:agent-1:mandate-1`;
      await manager["saveState"](key, state);

      const redis = (manager as any).redis;
      const ttl = await redis.ttl(key);

      // Should not have TTL when mandate has no expiration
      expect(ttl).toBe(-1);
    });
  });
});

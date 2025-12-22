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
});

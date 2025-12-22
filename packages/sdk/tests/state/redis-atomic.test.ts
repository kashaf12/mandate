import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RedisStateManager } from "../../src/state/redis";
import type { Action, Mandate } from "../../src/types";
import { MandateTemplates } from "../../src/mandate-factory";

describe("RedisStateManager - Atomic Operations", () => {
  let manager: RedisStateManager;
  let mandate: Mandate;

  beforeEach(async () => {
    manager = new RedisStateManager({
      host: "localhost",
      port: 6379,
      keyPrefix: "test:mandate:",
    });

    mandate = MandateTemplates.production("user@example.com", {
      maxCostTotal: 10.0,
      maxCostPerCall: 1.0,
    });
  });

  afterEach(async () => {
    await manager.remove("agent-1");
    await manager.close();
  });

  describe("checkAndCommit", () => {
    it("allows action within limits", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 0.5,
        costType: "EXECUTION",
      };

      const result = await manager.checkAndCommit(action, mandate);

      expect(result.allowed).toBe(true);
      expect(result.remainingCost).toBeCloseTo(9.5, 2);
    });

    it("blocks when budget exceeded", async () => {
      // Exhaust budget
      for (let i = 0; i < 10; i++) {
        await manager.checkAndCommit(
          {
            type: "tool_call",
            id: `action-${i}`,
            agentId: "agent-1",
            timestamp: Date.now(),
            tool: "test_tool",
            estimatedCost: 1.0,
            costType: "EXECUTION",
          },
          mandate
        );
      }

      // Next action should be blocked
      const result = await manager.checkAndCommit(
        {
          type: "tool_call",
          id: "action-11",
          agentId: "agent-1",
          timestamp: Date.now(),
          tool: "test_tool",
          estimatedCost: 0.5,
          costType: "EXECUTION",
        },
        mandate
      );

      expect(result.allowed).toBe(false);
      expect(result.code).toBe("COST_LIMIT_EXCEEDED");
    });

    it("blocks duplicate action IDs", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 0.5,
        costType: "EXECUTION",
      };

      // First call succeeds
      const result1 = await manager.checkAndCommit(action, mandate);
      expect(result1.allowed).toBe(true);

      // Second call with same ID blocked
      const result2 = await manager.checkAndCommit(action, mandate);
      expect(result2.allowed).toBe(false);
      expect(result2.code).toBe("DUPLICATE_ACTION");
    });

    it("enforces rate limits", async () => {
      mandate.rateLimit = { maxCalls: 5, windowMs: 60000 };

      // Make 5 calls (at limit)
      for (let i = 0; i < 5; i++) {
        const result = await manager.checkAndCommit(
          {
            type: "tool_call",
            id: `action-${i}`,
            agentId: "agent-1",
            timestamp: Date.now(),
            tool: "test_tool",
            estimatedCost: 0.1,
            costType: "EXECUTION",
          },
          mandate
        );
        expect(result.allowed).toBe(true);
      }

      // 6th call blocked
      const result = await manager.checkAndCommit(
        {
          type: "tool_call",
          id: "action-6",
          agentId: "agent-1",
          timestamp: Date.now(),
          tool: "test_tool",
          estimatedCost: 0.1,
          costType: "EXECUTION",
        },
        mandate
      );

      expect(result.allowed).toBe(false);
      expect(result.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("prevents race conditions (concurrent access)", async () => {
      mandate.maxCostTotal = 1.0;

      // Simulate two servers trying to spend $0.6 each simultaneously
      const action1: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 0.6,
        costType: "EXECUTION",
      };

      const action2: Action = {
        type: "tool_call",
        id: "action-2",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "test_tool",
        estimatedCost: 0.6,
        costType: "EXECUTION",
      };

      // Execute concurrently
      const [result1, result2] = await Promise.all([
        manager.checkAndCommit(action1, mandate),
        manager.checkAndCommit(action2, mandate),
      ]);

      // Exactly one should succeed
      const allowed = [result1.allowed, result2.allowed];
      expect(allowed.filter((a) => a).length).toBe(1);
      expect(allowed.filter((a) => !a).length).toBe(1);

      // Verify budget not exceeded
      const state = await manager.get("agent-1", mandate.id);
      expect(state.cumulativeCost).toBeLessThanOrEqual(1.0);
    });
  });
});

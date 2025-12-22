import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStateManager } from "../../src/state/memory";
import type { AgentState, Action } from "../../src/types";

describe("MemoryStateManager", () => {
  let manager: MemoryStateManager;

  beforeEach(() => {
    manager = new MemoryStateManager();
  });

  describe("Initialization", () => {
    it("creates default state for new agent", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      expect(state.agentId).toBe("agent-1");
      expect(state.mandateId).toBe("mandate-1");
      expect(state.cumulativeCost).toBe(0);
      expect(state.cognitionCost).toBe(0);
      expect(state.executionCost).toBe(0);
      expect(state.callCount).toBe(0);
      expect(state.killed).toBe(false);
      expect(state.seenActionIds.size).toBe(0);
      expect(state.seenIdempotencyKeys.size).toBe(0);
    });

    it("returns same state object for repeated gets", async () => {
      const state1 = await manager.get("agent-1", "mandate-1");
      const state2 = await manager.get("agent-1", "mandate-1");

      expect(state1).toBe(state2);
    });

    it("creates separate state for different agents", async () => {
      const state1 = await manager.get("agent-1", "mandate-1");
      const state2 = await manager.get("agent-2", "mandate-2");

      expect(state1).not.toBe(state2);
      expect(state1.agentId).toBe("agent-1");
      expect(state2.agentId).toBe("agent-2");
    });
  });

  describe("Commit After Success", () => {
    it("commits cost after successful execution", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 0.5,
        costType: "COGNITION",
      };

      await manager.commitSuccess(action, state, { actualCost: 0.48 });

      expect(state.cumulativeCost).toBe(0.48);
      expect(state.cognitionCost).toBe(0.48);
      expect(state.executionCost).toBe(0);
      expect(state.callCount).toBe(1);
      expect(state.seenActionIds.has("action-1")).toBe(true);
    });

    it("uses estimated cost if actual cost not provided", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 0.5,
      };

      await manager.commitSuccess(action, state);

      expect(state.cumulativeCost).toBe(0.5);
    });

    it("increments call count", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      await manager.commitSuccess(action, state);

      expect(state.callCount).toBe(1);
    });

    it("records action ID for replay protection", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      await manager.commitSuccess(action, state);

      expect(state.seenActionIds.has("action-1")).toBe(true);
    });

    it("records idempotency key if present", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        idempotencyKey: "idem-1",
      };

      await manager.commitSuccess(action, state);

      expect(state.seenIdempotencyKeys.has("idem-1")).toBe(true);
    });

    it("increments tool-specific call count", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
      };

      await manager.commitSuccess(action, state);

      expect(state.toolCallCounts.send_email).toBeDefined();
      expect(state.toolCallCounts.send_email.count).toBe(1);
    });

    it("tracks cognition vs execution costs separately", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      const llmCall: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 0.3,
        costType: "COGNITION",
      };

      const toolCall: Action = {
        type: "tool_call",
        id: "action-2",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.2,
        costType: "EXECUTION",
      };

      await manager.commitSuccess(llmCall, state);
      await manager.commitSuccess(toolCall, state);

      expect(state.cumulativeCost).toBe(0.5);
      expect(state.cognitionCost).toBe(0.3);
      expect(state.executionCost).toBe(0.2);
    });
  });

  describe("Rate Limit Window Management", () => {
    it("resets agent window when expired", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const rateLimit = { maxCalls: 100, windowMs: 60000 };

      state.callCount = 50;
      state.windowStart = Date.now() - 70000; // 70 seconds ago

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      await manager.commitSuccess(action, state, undefined, rateLimit);

      expect(state.callCount).toBe(1); // Reset
      expect(state.windowStart).toBeGreaterThan(Date.now() - 1000);
    });

    it("does not reset window when still active", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const rateLimit = { maxCalls: 100, windowMs: 60000 };

      const windowStart = Date.now() - 30000; // 30 seconds ago
      state.callCount = 50;
      state.windowStart = windowStart;

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      await manager.commitSuccess(
        action,
        state,
        undefined,
        undefined,
        rateLimit
      );

      expect(state.callCount).toBe(51); // Incremented
      expect(state.windowStart).toBe(windowStart); // Unchanged
    });

    it("resets tool window when expired", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const toolRateLimit = { maxCalls: 10, windowMs: 60000 };

      state.toolCallCounts.send_email = {
        count: 5,
        windowStart: Date.now() - 70000,
      };

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

      expect(state.toolCallCounts.send_email.count).toBe(1); // Reset
    });

    it("increments tool window when active", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const toolRateLimit = { maxCalls: 10, windowMs: 60000 };

      const windowStart = Date.now() - 30000;
      state.toolCallCounts.send_email = {
        count: 5,
        windowStart,
      };

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

      expect(state.toolCallCounts.send_email.count).toBe(6); // Incremented
      expect(state.toolCallCounts.send_email.windowStart).toBe(windowStart);
    });
  });

  describe("Kill Switch", () => {
    it("marks agent as killed", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      await manager.kill(state, "Manual termination");

      expect(state.killed).toBe(true);
      expect(state.killedReason).toBe("Manual termination");
      expect(state.killedAt).toBeGreaterThan(Date.now() - 1000);
    });

    it("uses default reason if not provided", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      await manager.kill(state);

      expect(state.killed).toBe(true);
      expect(state.killedReason).toBe("Kill switch activated");
    });
  });

  describe("Cleanup", () => {
    it("removes agent state", async () => {
      await manager.get("agent-1", "mandate-1");

      await manager.remove("agent-1");

      const newState = await manager.get("agent-1", "mandate-1");
      expect(newState.cumulativeCost).toBe(0); // Fresh state
    });
  });

  describe("GAP 1: Execution Lease Reconciliation", () => {
    it("initializes with empty execution leases", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      expect(state.executionLeases).toBeDefined();
      expect(state.executionLeases?.size).toBe(0);
    });

    it("reconciles expired leases on state access", async () => {
      const state = await manager.get("agent-1", "mandate-1");

      // Add an expired lease
      const expiredActionId = "expired-action";
      const pastTime = Date.now() - 1000; // 1 second ago
      state.executionLeases?.set(expiredActionId, pastTime);

      // Add a valid lease
      const validActionId = "valid-action";
      const futureTime = Date.now() + 5000; // 5 seconds from now
      state.executionLeases?.set(validActionId, futureTime);

      expect(state.executionLeases?.size).toBe(2);

      // Get state again - should reconcile expired leases
      const reconciledState = await manager.get("agent-1", "mandate-1");

      // Expired lease should be removed
      expect(reconciledState.executionLeases?.has(expiredActionId)).toBe(false);
      // Valid lease should remain
      expect(reconciledState.executionLeases?.has(validActionId)).toBe(true);
      expect(reconciledState.executionLeases?.size).toBe(1);
    });

    it("clears execution lease on successful commit", async () => {
      const state = await manager.get("agent-1", "mandate-1");
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      // Set a lease
      const leaseExpiresAt = Date.now() + 5000;
      state.executionLeases?.set(action.id, leaseExpiresAt);
      expect(state.executionLeases?.has(action.id)).toBe(true);

      // Commit success
      await manager.commitSuccess(action, state, { actualCost: 0.01 });

      // Lease should be cleared
      expect(state.executionLeases?.has(action.id)).toBe(false);
    });
  });
});

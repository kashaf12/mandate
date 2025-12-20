import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeWithMandate } from "../src/executor";
import { PolicyEngine } from "../src/policy";
import { StateManager } from "../src/state";
import type { Mandate, Action, ChargingPolicy } from "../src/types";
import { MandateBlockedError } from "../src/types";

describe("executeWithMandate", () => {
  let policy: PolicyEngine;
  let stateManager: StateManager;
  let mandate: Mandate;

  beforeEach(() => {
    policy = new PolicyEngine();
    stateManager = new StateManager();

    mandate = {
      version: 1,
      id: "mandate-1",
      agentId: "agent-1",
      issuedAt: Date.now(),
      maxCostTotal: 10.0,
      allowedTools: ["read_*"],
      deniedTools: [],
      defaultChargingPolicy: { type: "SUCCESS_BASED" },
    };
  });

  describe("Phase 1: Authorization", () => {
    it("evaluates policy before execution", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      const executor = vi.fn().mockResolvedValue({ data: "file contents" });

      await executeWithMandate(action, executor, mandate, policy, stateManager);

      // Executor should be called
      expect(executor).toHaveBeenCalledOnce();
    });

    it("does not execute when policy blocks", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "delete_file", // Not allowed
        estimatedCost: 0.01,
      };

      const executor = vi.fn().mockResolvedValue({ data: "deleted" });

      await expect(
        executeWithMandate(action, executor, mandate, policy, stateManager)
      ).rejects.toThrow(MandateBlockedError);

      // Executor should NOT be called
      expect(executor).not.toHaveBeenCalled();
    });

    it("throws MandateBlockedError with correct properties", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "delete_file",
        estimatedCost: 0.01,
      };

      const executor = vi.fn();

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(MandateBlockedError);
        expect((err as MandateBlockedError).code).toBe("TOOL_NOT_ALLOWED");
        expect((err as MandateBlockedError).agentId).toBe("agent-1");
      }
    });
  });

  describe("Phase 2: Execution", () => {
    it("executes when policy allows", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      const expectedResult = { data: "file contents" };
      const executor = vi.fn().mockResolvedValue(expectedResult);

      const result = await executeWithMandate(
        action,
        executor,
        mandate,
        policy,
        stateManager
      );

      expect(result).toBe(expectedResult);
    });

    it("propagates executor errors", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      const executor = vi.fn().mockRejectedValue(new Error("Network error"));

      await expect(
        executeWithMandate(action, executor, mandate, policy, stateManager)
      ).rejects.toThrow("Network error");
    });
  });

  describe("Phase 3: Verification", () => {
    it("passes when no verifier configured", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      const executor = vi.fn().mockResolvedValue({ data: "success" });

      const result = await executeWithMandate(
        action,
        executor,
        mandate,
        policy,
        stateManager
      );

      expect(result).toEqual({ data: "success" });
    });

    it("passes when verifier returns ok", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.5,
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          verifyResult: (ctx) => {
            const result = ctx.result as any;
            return result.delivered
              ? { ok: true }
              : { ok: false, reason: "Not delivered" };
          },
        },
      };

      const executor = vi.fn().mockResolvedValue({ delivered: true });

      const result = await executeWithMandate(
        action,
        executor,
        mandate,
        policy,
        stateManager
      );

      expect(result).toEqual({ delivered: true });
    });

    it("throws when verifier returns not ok", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.5,
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          verifyResult: (ctx) => {
            const result = ctx.result as any;
            return result.delivered
              ? { ok: true }
              : { ok: false, reason: "Email not delivered" };
          },
        },
      };

      const executor = vi.fn().mockResolvedValue({ delivered: false });

      await expect(
        executeWithMandate(action, executor, mandate, policy, stateManager)
      ).rejects.toThrow("Email not delivered");
    });
  });

  describe("Phase 4: Charging Policy", () => {
    it("applies SUCCESS_BASED by default - charges on success", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      const executor = vi.fn().mockResolvedValue({ data: "success" });

      await executeWithMandate(action, executor, mandate, policy, stateManager);

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0.5);
    });

    it("applies SUCCESS_BASED - does not charge on execution failure", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      const executor = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0); // Not charged
    });

    it("applies SUCCESS_BASED - does not charge on verification failure", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.5,
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          verifyResult: () => ({ ok: false, reason: "Failed" }),
        },
      };

      const executor = vi.fn().mockResolvedValue({ delivered: false });

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0); // Not charged
    });

    it("applies ATTEMPT_BASED - charges on execution failure", async () => {
      const chargingPolicy: ChargingPolicy = { type: "ATTEMPT_BASED" };

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      mandate.defaultChargingPolicy = chargingPolicy;
      const executor = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0.5); // Charged even on failure
    });

    it("applies ATTEMPT_BASED - charges on verification failure", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.5,
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          chargingPolicy: { type: "ATTEMPT_BASED" },
          verifyResult: () => ({ ok: false, reason: "Failed" }),
        },
      };

      const executor = vi.fn().mockResolvedValue({ delivered: false });

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0.5); // Charged even on verification failure
    });

    it("applies TIERED policy correctly", async () => {
      const chargingPolicy: ChargingPolicy = {
        type: "TIERED",
        attemptCost: 0.1,
        successCost: 0.3,
        verificationCost: 0.2,
      };

      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.6,
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          chargingPolicy,
          verifyResult: () => ({ ok: true }),
        },
      };

      const executor = vi.fn().mockResolvedValue({ delivered: true });

      await executeWithMandate(action, executor, mandate, policy, stateManager);

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBeCloseTo(0.6, 10); // 0.1 + 0.3 + 0.2
    });

    it("uses tool-specific charging policy over default", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.5,
      };

      mandate.defaultChargingPolicy = { type: "SUCCESS_BASED" };
      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          chargingPolicy: { type: "ATTEMPT_BASED" }, // Tool-specific override
        },
      };

      const executor = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0.5); // ATTEMPT_BASED applied, not SUCCESS_BASED
    });
  });

  describe("Phase 5: State Commitment", () => {
    it("commits state only after successful execution", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      const executor = vi.fn().mockResolvedValue({ data: "file contents" });

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0);

      await executeWithMandate(action, executor, mandate, policy, stateManager);

      expect(state.cumulativeCost).toBe(0.5);
      expect(state.seenActionIds.has("action-1")).toBe(true);
    });

    it("does not commit state when execution fails (SUCCESS_BASED)", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      const executor = vi.fn().mockRejectedValue(new Error("Network error"));

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0);

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      // State should be unchanged
      expect(state.cumulativeCost).toBe(0);
      expect(state.seenActionIds.has("action-1")).toBe(false);
    });

    it("commits state when execution fails (ATTEMPT_BASED)", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      mandate.defaultChargingPolicy = { type: "ATTEMPT_BASED" };
      const executor = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        await executeWithMandate(
          action,
          executor,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0.5); // Charged
      expect(state.seenActionIds.has("action-1")).toBe(true); // Recorded
    });

    it("uses actual cost if provided in result", async () => {
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 0.5,
      };

      const executor = vi.fn().mockResolvedValue({
        usage: { total_tokens: 1000 },
        actualCost: 0.48, // Actual was lower
      });

      const state = stateManager.get("agent-1", "mandate-1");

      await executeWithMandate(action, executor, mandate, policy, stateManager);

      // Should use actual cost, not estimated
      expect(state.cumulativeCost).toBe(0.48);
    });
  });

  describe("Retry Safety", () => {
    it("allows retry with same action ID after failure", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      // First attempt fails
      const executor1 = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        await executeWithMandate(
          action,
          executor1,
          mandate,
          policy,
          stateManager
        );
      } catch {
        // Expected
      }

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.seenActionIds.has("action-1")).toBe(false);

      // Retry with same action ID should work
      const executor2 = vi.fn().mockResolvedValue({ data: "success" });

      await executeWithMandate(
        action,
        executor2,
        mandate,
        policy,
        stateManager
      );

      expect(state.seenActionIds.has("action-1")).toBe(true);
      expect(state.cumulativeCost).toBe(0.5);
    });

    it("blocks duplicate execution after success", async () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.5,
      };

      const executor = vi.fn().mockResolvedValue({ data: "success" });

      // First execution succeeds
      await executeWithMandate(action, executor, mandate, policy, stateManager);

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.cumulativeCost).toBe(0.5);

      // Second execution with same ID should be blocked
      await expect(
        executeWithMandate(action, executor, mandate, policy, stateManager)
      ).rejects.toThrow(MandateBlockedError);

      // Cost should not double
      expect(state.cumulativeCost).toBe(0.5);
    });
  });
});

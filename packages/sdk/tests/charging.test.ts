import { describe, it, expect } from "vitest";
import { evaluateChargingPolicy } from "../src/charging";
import type { ChargingPolicy, Action } from "../src/types";
import type { ChargingContext } from "../src/charging";

describe("Charging Policies", () => {
  const baseAction: Action = {
    type: "tool_call",
    id: "action-1",
    agentId: "agent-1",
    timestamp: Date.now(),
    tool: "send_email",
    estimatedCost: 1.0,
  };

  describe("ATTEMPT_BASED", () => {
    const policy: ChargingPolicy = { type: "ATTEMPT_BASED" };

    it("charges for successful execution", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: true,
        estimatedCost: 1.0,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(1.0);
    });

    it("charges for failed execution", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: false,
        verificationSuccess: false,
        estimatedCost: 1.0,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(1.0);
    });

    it("charges for failed verification", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: false,
        estimatedCost: 1.0,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(1.0);
    });

    it("uses actual cost if provided", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: true,
        estimatedCost: 1.0,
        actualCost: 0.8,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(0.8);
    });
  });

  describe("SUCCESS_BASED (default)", () => {
    const policy: ChargingPolicy = { type: "SUCCESS_BASED" };

    it("charges for full success", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: true,
        estimatedCost: 1.0,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(1.0);
    });

    it("does not charge for execution failure", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: false,
        verificationSuccess: false,
        estimatedCost: 1.0,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(0);
    });

    it("does not charge for verification failure", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: false,
        estimatedCost: 1.0,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(0);
    });

    it("applies when no policy specified", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: false,
        verificationSuccess: false,
        estimatedCost: 1.0,
      };

      const cost = evaluateChargingPolicy(undefined, ctx);
      expect(cost).toBe(0);
    });
  });

  describe("TIERED", () => {
    const policy: ChargingPolicy = {
      type: "TIERED",
      attemptCost: 0.1,
      successCost: 0.5,
      verificationCost: 0.4,
    };

    it("charges full cost for complete success", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: true,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(1.0); // 0.1 + 0.5 + 0.4
    });

    it("charges attempt + success for execution without verification", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: false,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(0.6); // 0.1 + 0.5
    });

    it("charges only attempt for failed execution", () => {
      const ctx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: false,
        verificationSuccess: false,
      };

      const cost = evaluateChargingPolicy(policy, ctx);
      expect(cost).toBe(0.1); // attempt only
    });
  });

  describe("CUSTOM", () => {
    it("uses custom logic", () => {
      const policy: ChargingPolicy = {
        type: "CUSTOM",
        compute: (ctx) => {
          // Charge double for failures (punish the agent)
          if (!ctx.executionSuccess) {
            return (ctx.estimatedCost ?? 0) * 2;
          }
          return ctx.estimatedCost ?? 0;
        },
      };

      const failureCtx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: false,
        verificationSuccess: false,
        estimatedCost: 1.0,
      };

      const failureCost = evaluateChargingPolicy(policy, failureCtx);
      expect(failureCost).toBe(2.0);

      const successCtx: ChargingContext = {
        action: baseAction,
        executed: true,
        executionSuccess: true,
        verificationSuccess: true,
        estimatedCost: 1.0,
      };

      const successCost = evaluateChargingPolicy(policy, successCtx);
      expect(successCost).toBe(1.0);
    });
  });
});

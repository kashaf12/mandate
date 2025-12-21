import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine } from "../src/policy";
import type { Mandate, Action, AgentState } from "../src/types";
import { z } from "zod";
import { ValidationPatterns, CommonSchemas } from "../src/validation";

describe("PolicyEngine", () => {
  let engine: PolicyEngine;
  let mandate: Mandate;
  let state: AgentState;

  beforeEach(() => {
    engine = new PolicyEngine();

    mandate = {
      version: 1,
      id: "mandate-1",
      agentId: "agent-1",
      issuedAt: Date.now(),
      maxCostTotal: 10.0,
      maxCostPerCall: 1.0,
      allowedTools: ["read_*", "search"],
      deniedTools: ["delete_*", "execute_*"],
      rateLimit: {
        maxCalls: 100,
        windowMs: 60000,
      },
    };

    state = {
      agentId: "agent-1",
      mandateId: "mandate-1",
      cumulativeCost: 0,
      cognitionCost: 0,
      executionCost: 0,
      callCount: 0,
      windowStart: Date.now(),
      toolCallCounts: {},
      seenActionIds: new Set(),
      seenIdempotencyKeys: new Set(),
      killed: false,
    };
  });

  describe("Replay Protection", () => {
    it("blocks duplicate action IDs", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      state.seenActionIds.add("action-1");

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("DUPLICATE_ACTION");
      expect((decision as any).hard).toBe(true);
    });

    it("blocks duplicate idempotency keys", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        idempotencyKey: "idem-1",
      };

      state.seenIdempotencyKeys.add("idem-1");

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("DUPLICATE_ACTION");
      expect((decision as any).hard).toBe(true);
    });
  });

  describe("Kill Switch", () => {
    it("blocks all actions when agent is killed", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      state.killed = true;
      state.killedReason = "Manual termination";

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("AGENT_KILLED");
      expect((decision as any).hard).toBe(true);
      expect(decision.reason).toContain("Manual termination");
    });
  });

  describe("Mandate Expiration", () => {
    it("blocks when mandate is expired", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      mandate.expiresAt = Date.now() - 1000; // Expired 1 second ago

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("MANDATE_EXPIRED");
      expect((decision as any).hard).toBe(true);
    });

    it("allows when mandate has not expired", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      mandate.expiresAt = Date.now() + 86400000; // Expires in 1 day

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
    });
  });

  describe("Tool Permissions", () => {
    it("allows tool in allowlist", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
    });

    it("blocks tool in denylist", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "delete_file",
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("TOOL_DENIED");
    });

    it("blocks tool not in allowlist", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "write_file",
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("TOOL_NOT_ALLOWED");
    });

    it("denylist takes precedence over allowlist", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "execute_shell",
      };

      mandate.allowedTools = ["*"]; // Allow everything
      mandate.deniedTools = ["execute_*"]; // But deny execute_*

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("TOOL_DENIED");
    });

    it("allows LLM calls when no tool restrictions apply", () => {
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 0.01,
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
    });
  });

  describe("Cost Limits", () => {
    it("blocks when per-call cost exceeds maxCostPerCall", () => {
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 1.5,
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("COST_LIMIT_EXCEEDED");
      expect(decision.reason).toContain("1.5");
      expect(decision.reason).toContain("1");
    });

    it("blocks when cumulative cost exceeds maxCostTotal", () => {
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 0.5,
      };

      state.cumulativeCost = 9.8; // Already spent $9.80

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("COST_LIMIT_EXCEEDED");
      expect(decision.reason).toContain("10.3");
      expect(decision.reason).toContain("10");
    });

    it("allows when under cost limits", () => {
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 0.5,
      };

      state.cumulativeCost = 5.0;

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
      expect((decision as any).remainingCost).toBeCloseTo(4.5, 2);
    });

    it("allows when no cost limits set", () => {
      const action: Action = {
        type: "llm_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4",
        estimatedCost: 100.0,
      };

      delete mandate.maxCostTotal;
      delete mandate.maxCostPerCall;

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
    });
  });

  describe("Rate Limits", () => {
    it("blocks when agent rate limit exceeded", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      state.callCount = 100; // At limit
      state.windowStart = Date.now() - 30000; // 30 seconds into window

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("RATE_LIMIT_EXCEEDED");
      expect((decision as any).retryAfterMs).toBeGreaterThan(0);
      expect((decision as any).hard).toBe(false); // Retryable
    });

    it("allows when rate limit window has expired", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      state.callCount = 100;
      state.windowStart = Date.now() - 70000; // 70 seconds ago (window is 60s)

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
    });

    it("allows when under rate limit", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      state.callCount = 50;
      state.windowStart = Date.now() - 30000;

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
      expect((decision as any).remainingCalls).toBe(50);
    });
  });

  describe("Tool-Specific Policies", () => {
    it("blocks when tool-specific cost limit exceeded", () => {
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
          maxCostPerCall: 0.5,
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("COST_LIMIT_EXCEEDED");
      expect(decision.reason).toContain("send_email");
    });

    it("blocks when tool-specific rate limit exceeded", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.01,
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          rateLimit: {
            maxCalls: 10,
            windowMs: 60000,
          },
        },
      };

      state.toolCallCounts = {
        send_email: {
          count: 10,
          windowStart: Date.now() - 30000,
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("RATE_LIMIT_EXCEEDED");
      expect(decision.reason).toContain("send_email");
    });

    it("allows when under tool-specific limits", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        estimatedCost: 0.3,
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          maxCostPerCall: 0.5,
          rateLimit: {
            maxCalls: 10,
            windowMs: 60000,
          },
        },
      };

      state.toolCallCounts = {
        send_email: {
          count: 5,
          windowStart: Date.now() - 30000,
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
    });
  });

  describe("Precedence Order", () => {
    it("checks replay before other rules", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        estimatedCost: 0.01,
      };

      state.seenActionIds.add("action-1");
      state.killed = true; // Also killed

      const decision = engine.evaluate(action, mandate, state);

      // Should block for replay, not kill switch
      expect((decision as any).code).toBe("DUPLICATE_ACTION");
    });

    it("checks kill switch before expiration", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
      };

      state.killed = true;
      mandate.expiresAt = Date.now() - 1000;

      const decision = engine.evaluate(action, mandate, state);

      expect((decision as any).code).toBe("AGENT_KILLED");
    });

    it("checks denylist before allowlist", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "delete_file",
      };

      mandate.allowedTools = ["*"];
      mandate.deniedTools = ["delete_*"];

      const decision = engine.evaluate(action, mandate, state);

      expect((decision as any).code).toBe("TOOL_DENIED");
    });
  });

  describe("Argument Validation (Phase 2)", () => {
    it("blocks when Zod schema validation fails", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        args: { path: 123 }, // Should be string
      };

      mandate.allowedTools = ["read_file"];
      mandate.toolPolicies = {
        read_file: {
          argumentValidation: {
            schema: z.object({
              path: z.string(),
            }),
          },
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("ARGUMENT_VALIDATION_FAILED");
      expect(decision.reason).toContain("Expected string");
    });

    it("blocks when custom validation fails", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        args: { path: "/etc/passwd" },
      };

      mandate.allowedTools = ["read_file"];
      mandate.toolPolicies = {
        read_file: {
          argumentValidation: {
            validate: ValidationPatterns.noSystemPaths,
          },
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("ARGUMENT_VALIDATION_FAILED");
      expect(decision.reason).toContain("System paths not allowed");
    });

    it("allows when validation passes", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        args: { path: "/data/file.txt" },
        estimatedCost: 0.01,
      };

      mandate.allowedTools = ["read_file"];
      mandate.toolPolicies = {
        read_file: {
          argumentValidation: {
            schema: CommonSchemas.filePath,
            validate: ValidationPatterns.noSystemPaths,
          },
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW");
    });

    it("validates before cost limits (precedence)", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        args: { path: "/etc/passwd" },
        estimatedCost: 0.01,
      };

      mandate.allowedTools = ["read_file"];
      mandate.maxCostTotal = 10.0; // Would pass cost check
      mandate.toolPolicies = {
        read_file: {
          argumentValidation: {
            validate: ValidationPatterns.noSystemPaths,
          },
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      // Should block for validation, not cost
      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("ARGUMENT_VALIDATION_FAILED");
    });

    it("uses CommonSchemas for validation", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        args: { to: "invalid-email" },
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          argumentValidation: {
            schema: CommonSchemas.email,
          },
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("ARGUMENT_VALIDATION_FAILED");
      expect(decision.reason).toContain("Invalid email format");
    });

    it("combines schema and custom validation", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "send_email",
        args: { to: "user@external.com", subject: "Test" },
      };

      mandate.allowedTools = ["send_email"];
      mandate.toolPolicies = {
        send_email: {
          argumentValidation: {
            schema: CommonSchemas.email, // Validates email format
            validate: ValidationPatterns.internalEmailOnly("company.com"), // Validates domain
          },
        },
      };

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("BLOCK");
      expect((decision as any).code).toBe("ARGUMENT_VALIDATION_FAILED");
      expect(decision.reason).toContain("Only company.com emails allowed");
    });

    it("skips validation when no argumentValidation configured", () => {
      const action: Action = {
        type: "tool_call",
        id: "action-1",
        agentId: "agent-1",
        timestamp: Date.now(),
        tool: "read_file",
        args: { path: "/etc/passwd" }, // Would normally be blocked
        estimatedCost: 0.01,
      };

      mandate.allowedTools = ["read_file"];
      // No toolPolicies configured - validation skipped

      const decision = engine.evaluate(action, mandate, state);

      expect(decision.type).toBe("ALLOW"); // Passes because no validation
    });
  });
});

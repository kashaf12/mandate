import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createLLMAction,
  createToolAction,
  executeLLM,
  executeTool,
} from "../src/helpers";
import { PolicyEngine } from "../src/policy";
import { StateManager } from "../src/state";
import { LLMCall, Mandate, MandateBlockedError, ToolCall } from "../src/types";

describe("Helper Functions", () => {
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
      allowedTools: ["*"],
      defaultChargingPolicy: { type: "SUCCESS_BASED" },
    };
  });

  describe("createLLMAction", () => {
    it("creates action with cost estimation for OpenAI", () => {
      const action = createLLMAction("agent-1", "openai", "gpt-4o", 1000, 500);

      expect(action.type).toBe("llm_call");
      expect(action.agentId).toBe("agent-1");
      expect((action as LLMCall).provider).toBe("openai");
      expect((action as LLMCall).model).toBe("gpt-4o");
      expect(action.costType).toBe("COGNITION");
      expect(action.estimatedCost).toBeGreaterThan(0);
      expect(action.id).toMatch(/^llm-/);
    });

    it("creates action with cost estimation for Anthropic", () => {
      const action = createLLMAction(
        "agent-1",
        "anthropic",
        "claude-3-5-sonnet-20241022",
        2000,
        1000
      );

      expect(action.type).toBe("llm_call");
      expect((action as LLMCall).provider).toBe("anthropic");
      expect((action as LLMCall).model).toBe("claude-3-5-sonnet-20241022");
      expect(action.estimatedCost).toBeGreaterThan(0);
    });

    it("creates action with zero cost for Ollama", () => {
      const action = createLLMAction("agent-1", "ollama", "llama2", 1000, 500);

      expect(action.type).toBe("llm_call");
      expect((action as LLMCall).provider).toBe("ollama");
      expect(action.estimatedCost).toBe(0);
    });

    it("generates unique IDs", () => {
      const action1 = createLLMAction("agent-1", "openai", "gpt-4o", 1000, 500);
      const action2 = createLLMAction("agent-1", "openai", "gpt-4o", 1000, 500);

      expect(action1.id).not.toBe(action2.id);
    });
  });

  describe("createToolAction", () => {
    it("creates action with args and cost", () => {
      const action = createToolAction(
        "agent-1",
        "send_email",
        { to: "user@example.com", subject: "Hello" },
        0.01
      );

      expect(action.type).toBe("tool_call");
      expect(action.agentId).toBe("agent-1");
      expect((action as ToolCall).tool).toBe("send_email");
      expect((action as ToolCall).args).toEqual({
        to: "user@example.com",
        subject: "Hello",
      });
      expect(action.estimatedCost).toBe(0.01);
      expect(action.costType).toBe("EXECUTION");
      expect(action.id).toMatch(/^tool-/);
    });

    it("creates action without args", () => {
      const action = createToolAction("agent-1", "read_config");

      expect((action as ToolCall).tool).toBe("read_config");
      expect((action as ToolCall).args).toBeUndefined();
      expect(action.estimatedCost).toBeUndefined();
    });

    it("generates unique IDs", () => {
      const action1 = createToolAction("agent-1", "send_email");
      const action2 = createToolAction("agent-1", "send_email");

      expect(action1.id).not.toBe(action2.id);
    });
  });

  describe("executeLLM", () => {
    it("executes and extracts cost from OpenAI response", async () => {
      const action = createLLMAction("agent-1", "openai", "gpt-4o", 1000, 500);

      const mockResponse = {
        id: "chatcmpl-123",
        choices: [{ message: { content: "Hello!" } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const fn = vi.fn().mockResolvedValue(mockResponse);

      const result = await executeLLM(
        action,
        fn,
        mandate,
        policy,
        stateManager
      );

      expect(result).toBe(mockResponse);
      expect((result as any).actualCost).toBeDefined();
      expect((result as any).actualCost).toBeGreaterThan(0);
      expect(fn).toHaveBeenCalledOnce();
    });

    it("executes and extracts cost from Anthropic response", async () => {
      const action = createLLMAction(
        "agent-1",
        "anthropic",
        "claude-3-5-sonnet-20241022",
        1000,
        500
      );

      const mockResponse = {
        id: "msg_123",
        content: [{ text: "Hello!" }],
        usage: {
          input_tokens: 1000, // ← Changed from 10
          output_tokens: 500, // ← Changed from 5
        },
      };

      const fn = vi.fn().mockResolvedValue(mockResponse);

      const result = await executeLLM(
        action,
        fn,
        mandate,
        policy,
        stateManager
      );

      expect(result).toBe(mockResponse);
      expect((result as any).actualCost).toBeDefined();
      expect((result as any).actualCost).toBeGreaterThan(0);
    });

    it("handles responses without usage", async () => {
      const action = createLLMAction("agent-1", "openai", "gpt-4o", 1000, 500);

      const mockResponse = {
        id: "chatcmpl-123",
        choices: [{ message: { content: "Hello!" } }],
        // No usage field
      };

      const fn = vi.fn().mockResolvedValue(mockResponse);

      const result = await executeLLM(
        action,
        fn,
        mandate,
        policy,
        stateManager
      );

      expect(result).toBe(mockResponse);
      expect((result as any).actualCost).toBeUndefined();
    });

    it("commits state with actual cost", async () => {
      const action = createLLMAction("agent-1", "openai", "gpt-4o", 1000, 500);

      const mockResponse = {
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500,
        },
      };

      const fn = vi.fn().mockResolvedValue(mockResponse);

      await executeLLM(action, fn, mandate, policy, stateManager);

      const state = stateManager.get("agent-1", "mandate-1");

      // Should use actual cost, not estimated
      expect(state.cumulativeCost).toBeGreaterThan(0);
      expect(state.cognitionCost).toBeGreaterThan(0);
      expect(state.executionCost).toBe(0);
    });
  });

  describe("executeTool", () => {
    it("executes tool successfully", async () => {
      const action = createToolAction(
        "agent-1",
        "send_email",
        {
          to: "user@example.com",
        },
        0.01
      );

      const mockResult = { messageId: "msg-123", sent: true };
      const fn = vi.fn().mockResolvedValue(mockResult);

      const result = await executeTool(
        action,
        fn,
        mandate,
        policy,
        stateManager
      );

      expect(result).toBe(mockResult);
      expect(fn).toHaveBeenCalledOnce();
    });

    it("commits state with tool cost", async () => {
      const action = createToolAction(
        "agent-1",
        "send_email",
        {
          to: "user@example.com",
        },
        0.05
      );

      const fn = vi.fn().mockResolvedValue({ sent: true });

      await executeTool(action, fn, mandate, policy, stateManager);

      const state = stateManager.get("agent-1", "mandate-1");

      expect(state.cumulativeCost).toBe(0.05);
      expect(state.executionCost).toBe(0.05);
      expect(state.cognitionCost).toBe(0);
    });

    it("enforces mandate restrictions", async () => {
      mandate.allowedTools = ["read_*"];

      const action = createToolAction(
        "agent-1",
        "send_email",
        {
          to: "user@example.com",
        },
        0.01
      );

      const fn = vi.fn().mockResolvedValue({ sent: true });

      try {
        await executeTool(action, fn, mandate, policy, stateManager);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(MandateBlockedError);
        expect((err as MandateBlockedError).code).toBe("TOOL_NOT_ALLOWED");
      }

      expect(fn).not.toHaveBeenCalled();
    });
  });
});

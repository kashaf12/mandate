import { describe, it, expect, beforeEach, vi } from "vitest";
import { MandateClient } from "../src/client";
import { createToolAction, createLLMAction } from "../src/helpers";
import { MemoryAuditLogger } from "../src/audit";
import type { Mandate } from "../src/types";

describe("MandateClient", () => {
  let mandate: Mandate;

  beforeEach(() => {
    mandate = {
      version: 1,
      id: "mandate-1",
      agentId: "agent-1",
      issuedAt: Date.now(),
      maxCostTotal: 10.0,
      allowedTools: ["*"],
    };
  });

  describe("Construction", () => {
    it("creates client with minimal config", () => {
      const client = new MandateClient({ mandate });

      expect(client).toBeDefined();
      expect(client.getCost().total).toBe(0);
      expect(client.getCallCount()).toBe(0);
    });

    it("creates client with console logger", () => {
      const client = new MandateClient({
        mandate,
        auditLogger: "console",
      });

      expect(client.internals.auditLogger).toBeDefined();
    });

    it("creates client with memory logger", () => {
      const client = new MandateClient({
        mandate,
        auditLogger: "memory",
      });

      expect(client.internals.auditLogger).toBeInstanceOf(MemoryAuditLogger);
    });

    it("creates client with no logger", () => {
      const client = new MandateClient({
        mandate,
        auditLogger: "none",
      });

      expect(client.internals.auditLogger).toBeDefined();
    });

    it("creates client with file logger", () => {
      const client = new MandateClient({
        mandate,
        auditLogger: { file: "/tmp/audit.log" },
      });

      expect(client.internals.auditLogger).toBeDefined();
    });

    it("creates client with custom logger", () => {
      const customLogger = new MemoryAuditLogger();
      const client = new MandateClient({
        mandate,
        auditLogger: customLogger,
      });

      expect(client.internals.auditLogger).toBe(customLogger);
    });
  });

  describe("executeTool", () => {
    it("executes tool successfully", async () => {
      const client = new MandateClient({ mandate });
      const action = createToolAction("agent-1", "read_file", {}, 0.01);
      const fn = vi.fn().mockResolvedValue({ data: "success" });

      const result = await client.executeTool(action, fn);

      expect(result).toEqual({ data: "success" });
      expect(fn).toHaveBeenCalled();
      expect(client.getCost().total).toBe(0.01);
      expect(client.getCallCount()).toBe(1);
    });

    it("blocks unauthorized tools", async () => {
      mandate.allowedTools = ["read_*"];
      const client = new MandateClient({ mandate });
      const action = createToolAction("agent-1", "delete_file", {}, 0.01);
      const fn = vi.fn();

      await expect(client.executeTool(action, fn)).rejects.toThrow();
      expect(fn).not.toHaveBeenCalled();
      expect(client.getCost().total).toBe(0);
    });
  });

  describe("executeLLM", () => {
    it("executes LLM call successfully", async () => {
      const client = new MandateClient({ mandate });
      const action = createLLMAction("agent-1", "openai", "gpt-4o", 100, 50);

      const mockResponse = {
        id: "chat-123",
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      const fn = vi.fn().mockResolvedValue(mockResponse);

      const result = await client.executeLLM(action, fn);

      expect(result).toBe(mockResponse);
      expect(client.getCost().cognition).toBeGreaterThan(0);
    });
  });

  describe("State Queries", () => {
    it("returns current cost", async () => {
      const client = new MandateClient({ mandate });
      const action = createToolAction("agent-1", "read_file", {}, 0.5);
      await client.executeTool(action, vi.fn().mockResolvedValue({}));

      const cost = client.getCost();
      expect(cost.total).toBe(0.5);
      expect(cost.execution).toBe(0.5);
      expect(cost.cognition).toBe(0);
    });

    it("returns remaining budget", async () => {
      const client = new MandateClient({ mandate });

      expect(client.getRemainingBudget()).toBe(10.0);

      const action = createToolAction("agent-1", "read_file", {}, 3.0);
      await client.executeTool(action, vi.fn().mockResolvedValue({}));

      expect(client.getRemainingBudget()).toBe(7.0);
    });

    it("returns undefined for unlimited budget", () => {
      delete mandate.maxCostTotal;
      const client = new MandateClient({ mandate });

      expect(client.getRemainingBudget()).toBeUndefined();
    });

    it("returns call count", async () => {
      const client = new MandateClient({ mandate });

      expect(client.getCallCount()).toBe(0);

      // Create DIFFERENT actions (different IDs)
      const action1 = createToolAction("agent-1", "read_file", {}, 0.01);
      const action2 = createToolAction("agent-1", "read_file", {}, 0.01);

      await client.executeTool(action1, vi.fn().mockResolvedValue({}));
      await client.executeTool(action2, vi.fn().mockResolvedValue({}));

      expect(client.getCallCount()).toBe(2);
    });
  });

  describe("Kill Switch", () => {
    it("kills agent", () => {
      const client = new MandateClient({ mandate });

      expect(client.isKilled()).toBe(false);

      client.kill("Test kill");

      expect(client.isKilled()).toBe(true);
    });

    it("blocks execution when killed", async () => {
      const client = new MandateClient({ mandate });
      client.kill("Test kill");

      const action = createToolAction("agent-1", "read_file", {}, 0.01);

      await expect(client.executeTool(action, vi.fn())).rejects.toThrow(
        "killed"
      );
    });

    it("resurrects killed agent", () => {
      const client = new MandateClient({ mandate });
      client.kill("Test kill");

      expect(client.isKilled()).toBe(true);

      client.resurrect();

      expect(client.isKilled()).toBe(false);
    });
  });

  describe("Audit Entries", () => {
    it("returns audit entries with memory logger", async () => {
      const client = new MandateClient({
        mandate,
        auditLogger: "memory",
      });

      const action = createToolAction("agent-1", "read_file", {}, 0.01);
      await client.executeTool(action, vi.fn().mockResolvedValue({}));

      const entries = client.getAuditEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].decision).toBe("ALLOW");
    });

    it("throws without memory logger", () => {
      const client = new MandateClient({
        mandate,
        auditLogger: "console",
      });

      expect(() => client.getAuditEntries()).toThrow("MemoryAuditLogger");
    });
  });

  describe("Mandate Access", () => {
    it("returns mandate", () => {
      const client = new MandateClient({ mandate });

      expect(client.getMandate()).toBe(mandate);
    });
  });
});

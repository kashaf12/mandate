import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MandateClient } from "../src/client";
import { createToolAction, createLLMAction } from "../src/helpers";
import type { Mandate } from "../src/types";

// Mock fetch globally for backend calls
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

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
      toolPolicies: {},
    };

    // Mock backend responses
    mockFetch.mockClear();
  });

  /**
   * Helper to create a mock mandate response
   */
  function createMockMandateResponse(customMandate?: Partial<Mandate>) {
    const m = { ...mandate, ...customMandate };
    return {
      ok: true,
      json: async () => ({
        mandateId: m.id,
        effectiveAuthority: {
          allowedTools: m.allowedTools || [],
          deniedTools: m.deniedTools || [],
          toolPolicies: m.toolPolicies || {},
          maxCostTotal: m.maxCostTotal,
        },
        expiresAt: new Date((m.issuedAt || Date.now()) + 300000).toISOString(),
      }),
    };
  }

  /**
   * Helper to create a mock kill switch response
   */
  function createMockKillSwitchResponse(killed: boolean = false) {
    return {
      ok: true,
      json: async () => ({ killed }),
    };
  }

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("Construction", () => {
    it("creates client with minimal config", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      expect(client).toBeDefined();
      expect(client.getMandate()).toBeDefined();
      expect((await client.getCost()).total).toBe(0);
      expect(await client.getCallCount()).toBe(0);

      await client.close();
    });
  });

  describe("executeTool", () => {
    it("executes tool successfully", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      const action = createToolAction("agent-1", "read_file", {}, 0.01);
      const fn = vi.fn().mockResolvedValue({ data: "success" });

      const result = await client.executeTool(action, fn);

      expect(result).toEqual({ data: "success" });
      expect(fn).toHaveBeenCalled();
      expect((await client.getCost()).total).toBe(0.01);
      expect(await client.getCallCount()).toBe(1);

      await client.close();
    });

    it("blocks unauthorized tools", async () => {
      // Mock mandate issuance with restricted tools
      mockFetch.mockResolvedValueOnce(
        createMockMandateResponse({ allowedTools: ["read_*"] })
      );
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      const action = createToolAction("agent-1", "delete_file", {}, 0.01);
      const fn = vi.fn();

      await expect(client.executeTool(action, fn)).rejects.toThrow();
      expect(fn).not.toHaveBeenCalled();
      expect((await client.getCost()).total).toBe(0);

      await client.close();
    });
  });

  describe("executeLLM", () => {
    it("executes LLM call successfully", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      const action = createLLMAction("agent-1", "openai", "gpt-4o", 100, 50);

      const mockResponse = {
        id: "chat-123",
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      const fn = vi.fn().mockResolvedValue(mockResponse);

      const result = await client.executeLLM(action, fn);

      expect(result).toBe(mockResponse);
      expect((await client.getCost()).cognition).toBeGreaterThan(0);

      await client.close();
    });
  });

  describe("State Queries", () => {
    it("returns current cost", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      const action = createToolAction("agent-1", "read_file", {}, 0.5);
      await client.executeTool(action, vi.fn().mockResolvedValue({}));

      const cost = await client.getCost();
      expect(cost.total).toBe(0.5);
      expect(cost.execution).toBe(0.5);
      expect(cost.cognition).toBe(0);

      await client.close();
    });

    it("returns remaining budget", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch check
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      expect(await client.getRemainingBudget()).toBe(10.0);

      const action = createToolAction("agent-1", "read_file", {}, 3.0);
      await client.executeTool(action, vi.fn().mockResolvedValue({}));

      expect(await client.getRemainingBudget()).toBe(7.0);

      await client.close();
    });

    it("returns undefined for unlimited budget", async () => {
      // Mock mandate issuance without maxCostTotal
      mockFetch.mockResolvedValueOnce(
        createMockMandateResponse({ maxCostTotal: undefined })
      );

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      expect(await client.getRemainingBudget()).toBeUndefined();

      await client.close();
    });

    it("returns call count", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch checks (2 calls)
      mockFetch
        .mockResolvedValueOnce(createMockKillSwitchResponse(false))
        .mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      expect(await client.getCallCount()).toBe(0);

      // Create DIFFERENT actions (different IDs)
      const action1 = createToolAction("agent-1", "read_file", {}, 0.01);
      const action2 = createToolAction("agent-1", "read_file", {}, 0.01);

      await client.executeTool(action1, vi.fn().mockResolvedValue({}));
      await client.executeTool(action2, vi.fn().mockResolvedValue({}));

      expect(await client.getCallCount()).toBe(2);

      await client.close();
    });
  });

  describe("Kill Switch", () => {
    it("kills agent", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch checks
      mockFetch
        .mockResolvedValueOnce(createMockKillSwitchResponse(false))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce(createMockKillSwitchResponse(true));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      expect(await client.isKilled()).toBe(false);

      await client.kill("Test kill");

      expect(await client.isKilled()).toBe(true);

      await client.close();
    });

    it("blocks execution when killed", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch check - return killed=true
      mockFetch.mockResolvedValueOnce(createMockKillSwitchResponse(true));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      const action = createToolAction("agent-1", "read_file", {}, 0.01);

      await expect(client.executeTool(action, vi.fn())).rejects.toThrow(
        "killed"
      );

      await client.close();
    });

    it("resurrects killed agent", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());
      // Mock kill switch checks
      mockFetch
        .mockResolvedValueOnce(createMockKillSwitchResponse(true))
        .mockResolvedValueOnce(createMockKillSwitchResponse(false));

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      expect(await client.isKilled()).toBe(true);

      await client.resurrect();

      expect(await client.isKilled()).toBe(false);

      await client.close();
    });
  });

  describe("Audit Entries", () => {
    it("throws error (audit entries now synced to backend)", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      expect(() => client.getAuditEntries()).toThrow(
        "Audit entries are now synced to backend"
      );

      await client.close();
    });
  });

  describe("Mandate Access", () => {
    it("returns mandate", async () => {
      // Mock mandate issuance
      mockFetch.mockResolvedValueOnce(createMockMandateResponse());

      const client = await MandateClient.create({
        agentId: "agent-1",
        apiKey: "test-key",
        backendUrl: "http://localhost:3000",
        context: {},
      });

      const returnedMandate = client.getMandate();
      expect(returnedMandate).toBeDefined();
      expect(returnedMandate?.id).toBe(mandate.id);
      expect(returnedMandate?.agentId).toBe(mandate.agentId);

      await client.close();
    });
  });
});

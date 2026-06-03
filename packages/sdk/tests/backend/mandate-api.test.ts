import { describe, it, expect, vi, beforeEach } from "vitest";
import { MandateAPI } from "../../src/backend/mandate-api";
import type { BackendClient } from "../../src/backend/client";
import type {
  BackendMandateResponse,
  BackendMandateDetail,
} from "../../src/backend/mandate-types";

describe("MandateAPI", () => {
  let api: MandateAPI;
  let mockClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    api = new MandateAPI(mockClient as unknown as BackendClient);
  });

  describe("issue", () => {
    it("should issue mandate and convert response format", async () => {
      const backendResponse: BackendMandateResponse = {
        mandateId: "mnd-abc123",
        effectiveAuthority: {
          allowedTools: ["web_search", "read_file"],
          deniedTools: ["delete_*"],
          maxCostTotal: 10.0,
          maxCostPerCall: 1.0,
          rateLimit: {
            maxCalls: 100,
            windowMs: 3600000,
          },
          toolPolicies: {
            web_search: {
              estimatedCost: 0.05,
              rateLimit: {
                maxCalls: 10,
                windowMs: 3600000,
              },
            },
          },
        },
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockClient.post.mockResolvedValueOnce(backendResponse);

      const mandate = await api.issue("agent-123", {
        user_tier: "free",
        environment: "production",
      });

      // Verify API call
      expect(mockClient.post).toHaveBeenCalledWith("/mandates/issue", {
        context: {
          user_tier: "free",
          environment: "production",
        },
      });

      // Verify conversion
      expect(mandate).toMatchObject({
        id: "mnd-abc123",
        version: 1,
        agentId: "agent-123",
        allowedTools: ["web_search", "read_file"],
        deniedTools: ["delete_*"],
        maxCostTotal: 10.0,
        maxCostPerCall: 1.0,
      });

      // Verify timestamp conversion (ISO → epoch)
      const expiresAtEpoch = new Date(backendResponse.expiresAt).getTime();
      expect(mandate.expiresAt).toBe(expiresAtEpoch);
      expect(mandate.issuedAt).toBeLessThanOrEqual(Date.now());
    });

    it("should handle minimal authority response", async () => {
      const backendResponse: BackendMandateResponse = {
        mandateId: "mnd-minimal",
        effectiveAuthority: {
          allowedTools: ["*"],
        },
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockClient.post.mockResolvedValueOnce(backendResponse);

      const mandate = await api.issue("agent-123", {});

      expect(mandate.id).toBe("mnd-minimal");
      expect(mandate.allowedTools).toEqual(["*"]);
      expect(mandate.deniedTools).toEqual([]);
      expect(mandate.toolPolicies).toEqual({});
    });

    it("should include tool policies in mandate", async () => {
      const backendResponse: BackendMandateResponse = {
        mandateId: "mnd-123",
        effectiveAuthority: {
          allowedTools: ["web_search"],
          toolPolicies: {
            web_search: {
              estimatedCost: 0.05,
              timeout: 30000,
              rateLimit: {
                maxCalls: 10,
                windowMs: 3600000,
              },
            },
          },
        },
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockClient.post.mockResolvedValueOnce(backendResponse);

      const mandate = await api.issue("agent-123", {});

      expect(mandate.toolPolicies).toEqual({
        web_search: {
          estimatedCost: 0.05,
          timeout: 30000,
          rateLimit: {
            maxCalls: 10,
            windowMs: 3600000,
          },
        },
      });
    });

    it("should include rate limits in mandate", async () => {
      const backendResponse: BackendMandateResponse = {
        mandateId: "mnd-123",
        effectiveAuthority: {
          allowedTools: ["*"],
          rateLimit: {
            maxCalls: 100,
            windowMs: 60000,
          },
        },
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockClient.post.mockResolvedValueOnce(backendResponse);

      const mandate = await api.issue("agent-123", {});

      expect(mandate.rateLimit).toEqual({
        maxCalls: 100,
        windowMs: 60000,
      });
    });

    it("should extract additional authority fields", async () => {
      const backendResponse: BackendMandateResponse = {
        mandateId: "mnd-123",
        effectiveAuthority: {
          allowedTools: ["*"],
          customField: "custom-value",
          anotherField: { nested: "data" },
        },
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockClient.post.mockResolvedValueOnce(backendResponse);

      const mandate = await api.issue("agent-123", {});

      expect((mandate as Record<string, any>).customField).toBe("custom-value");
      expect((mandate as Record<string, any>).anotherField).toEqual({
        nested: "data",
      });
    });
  });

  describe("get", () => {
    it("should fetch mandate details", async () => {
      const backendDetail: BackendMandateDetail = {
        mandateId: "mnd-abc123",
        agentId: "agent-123",
        context: {
          user_tier: "free",
          environment: "production",
        },
        matchedRules: [
          { ruleId: "rule-free-tier", ruleVersion: 3 },
          { ruleId: "rule-prod-safety", ruleVersion: 1 },
        ],
        appliedPolicies: [
          { policyId: "policy-free-tier", policyVersion: 5 },
          { policyId: "policy-prod-guardrails", policyVersion: 2 },
        ],
        effectiveAuthority: {
          allowedTools: ["web_search"],
          maxCostTotal: 1.0,
        },
        issuedAt: "2025-12-28T10:25:00.000Z",
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockClient.get.mockResolvedValueOnce(backendDetail);

      const detail = await api.get("mnd-abc123");

      expect(mockClient.get).toHaveBeenCalledWith("/mandates/mnd-abc123");
      expect(detail).toEqual(backendDetail);
    });
  });

  describe("timestamp conversion", () => {
    it("should convert ISO timestamps to epoch milliseconds", async () => {
      const isoTimestamp = "2025-12-28T10:30:00.000Z";
      const expectedEpoch = new Date(isoTimestamp).getTime();

      const backendResponse: BackendMandateResponse = {
        mandateId: "mnd-123",
        effectiveAuthority: { allowedTools: ["*"] },
        expiresAt: isoTimestamp,
      };

      mockClient.post.mockResolvedValueOnce(backendResponse);

      const mandate = await api.issue("agent-123", {});

      expect(mandate.expiresAt).toBe(expectedEpoch);
    });

    it("should set issuedAt to current time", async () => {
      const before = Date.now();

      const backendResponse: BackendMandateResponse = {
        mandateId: "mnd-123",
        effectiveAuthority: { allowedTools: ["*"] },
        expiresAt: "2025-12-28T10:30:00.000Z",
      };

      mockClient.post.mockResolvedValueOnce(backendResponse);

      const mandate = await api.issue("agent-123", {});

      const after = Date.now();

      expect(mandate.issuedAt).toBeGreaterThanOrEqual(before);
      expect(mandate.issuedAt).toBeLessThanOrEqual(after);
    });
  });
});

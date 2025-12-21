import { describe, it, expect } from "vitest";
import { createMandate, MandateTemplates } from "../src/mandate-factory";

describe("Mandate Factory", () => {
  describe("createMandate", () => {
    it("creates mandate with required fields", () => {
      const mandate = createMandate({
        principal: "user@example.com",
      });

      expect(mandate.version).toBe(1);
      expect(mandate.id).toMatch(/^mandate-/);
      expect(mandate.agentId).toMatch(/^agent-/);
      expect(mandate.principal).toBe("user@example.com");
      expect(mandate.identity).toBeDefined();
      expect(mandate.identity?.principal).toBe("user@example.com");
      expect(mandate.issuedAt).toBeGreaterThan(0);
    });

    it("uses provided agentId", () => {
      const mandate = createMandate({
        agentId: "custom-agent-id",
        principal: "user@example.com",
      });

      expect(mandate.agentId).toBe("custom-agent-id");
      expect(mandate.identity?.agentId).toBe("custom-agent-id");
    });

    it("sets expiration from expiresAt", () => {
      const expiresAt = Date.now() + 3600000;

      const mandate = createMandate({
        principal: "user@example.com",
        expiresAt,
      });

      expect(mandate.expiresAt).toBe(expiresAt);
    });

    it("calculates expiration from expiresInMs", () => {
      const before = Date.now();
      const mandate = createMandate({
        principal: "user@example.com",
        expiresInMs: 3600000, // 1 hour
      });
      const after = Date.now();

      expect(mandate.expiresAt).toBeGreaterThanOrEqual(before + 3600000);
      expect(mandate.expiresAt).toBeLessThanOrEqual(after + 3600000);
    });

    it("includes all optional fields", () => {
      const mandate = createMandate({
        principal: "user@example.com",
        description: "Test agent",
        maxCostTotal: 10.0,
        maxCostPerCall: 1.0,
        rateLimit: { maxCalls: 100, windowMs: 60000 },
        allowedTools: ["read_*"],
        deniedTools: ["delete_*"],
        defaultChargingPolicy: { type: "SUCCESS_BASED" },
      });

      expect(mandate.identity?.description).toBe("Test agent");
      expect(mandate.maxCostTotal).toBe(10.0);
      expect(mandate.maxCostPerCall).toBe(1.0);
      expect(mandate.rateLimit).toEqual({ maxCalls: 100, windowMs: 60000 });
      expect(mandate.allowedTools).toEqual(["read_*"]);
      expect(mandate.deniedTools).toEqual(["delete_*"]);
      expect(mandate.defaultChargingPolicy).toEqual({ type: "SUCCESS_BASED" });
    });
  });

  describe("MandateTemplates", () => {
    describe("restricted", () => {
      it("creates restricted mandate", () => {
        const mandate = MandateTemplates.restricted("user@example.com");

        expect(mandate.maxCostTotal).toBe(1.0);
        expect(mandate.maxCostPerCall).toBe(0.1);
        expect(mandate.allowedTools).toEqual(["read_*"]);
        expect(mandate.deniedTools).toContain("delete_*");
        expect(mandate.deniedTools).toContain("execute_*");
        expect(mandate.expiresAt).toBeDefined();
      });

      it("allows overrides", () => {
        const mandate = MandateTemplates.restricted("user@example.com", {
          maxCostTotal: 5.0,
        });

        expect(mandate.maxCostTotal).toBe(5.0);
        expect(mandate.maxCostPerCall).toBe(0.1); // Other defaults preserved
      });
    });

    describe("development", () => {
      it("creates development mandate", () => {
        const mandate = MandateTemplates.development("user@example.com");

        expect(mandate.maxCostTotal).toBe(10.0);
        expect(mandate.allowedTools).toEqual(["*"]);
        expect(mandate.deniedTools).toContain("drop_*");
      });
    });

    describe("production", () => {
      it("creates production mandate", () => {
        const mandate = MandateTemplates.production("user@example.com");

        expect(mandate.maxCostTotal).toBe(100.0);
        expect(mandate.maxCostPerCall).toBe(5.0);
        expect(mandate.rateLimit).toBeDefined();
        expect(mandate.defaultChargingPolicy).toEqual({
          type: "SUCCESS_BASED",
        });
      });
    });

    describe("temporary", () => {
      it("creates temporary mandate", () => {
        const mandate = MandateTemplates.temporary("user@example.com");

        expect(mandate.maxCostTotal).toBe(0.5);
        expect(mandate.rateLimit?.maxCalls).toBe(10);
        expect(mandate.expiresAt).toBeDefined();

        // Should expire in ~5 minutes
        const expiresIn = mandate.expiresAt! - Date.now();
        expect(expiresIn).toBeGreaterThan(250000);
        expect(expiresIn).toBeLessThan(350000);
      });
    });
  });
});

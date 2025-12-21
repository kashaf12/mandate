import { describe, it, expect } from "vitest";
import { createAgentIdentity } from "../src/identity";
import type { Mandate } from "../src/types";

describe("Types", () => {
  describe("Mandate", () => {
    it("accepts identity field", () => {
      const identity = createAgentIdentity("agent-1", "user@example.com");

      const mandate: Mandate = {
        version: 1,
        id: "mandate-1",
        agentId: "agent-1",
        identity, // NEW
        issuedAt: Date.now(),
        maxCostTotal: 10.0,
      };

      expect(mandate.identity).toBe(identity);
      expect(mandate.identity?.principal).toBe("user@example.com");
    });

    it("works without identity (backward compat)", () => {
      const mandate: Mandate = {
        version: 1,
        id: "mandate-1",
        agentId: "agent-1",
        principal: "user@example.com",
        issuedAt: Date.now(),
        maxCostTotal: 10.0,
      };

      expect(mandate.identity).toBeUndefined();
      expect(mandate.principal).toBe("user@example.com");
    });
  });
});

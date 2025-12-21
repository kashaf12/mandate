import { describe, it, expect, beforeEach } from "vitest";
import { MemoryAgentRegistry } from "../src/registry";
import { createAgentIdentity } from "../src/identity";

describe("MemoryAgentRegistry", () => {
  let registry: MemoryAgentRegistry;

  beforeEach(() => {
    registry = new MemoryAgentRegistry();
  });

  describe("register", () => {
    it("registers new agent", async () => {
      const identity = createAgentIdentity("agent-1", "user@example.com");

      await registry.register(identity);

      const retrieved = await registry.get("agent-1");
      expect(retrieved).toEqual(identity);
    });

    it("is idempotent - re-registering updates", async () => {
      const identity1 = createAgentIdentity("agent-1", "user@example.com", {
        description: "First version",
      });

      await registry.register(identity1);

      const identity2 = createAgentIdentity("agent-1", "user@example.com", {
        description: "Updated version",
      });

      await registry.register(identity2);

      const retrieved = await registry.get("agent-1");
      expect(retrieved?.description).toBe("Updated version");
    });
  });

  describe("get", () => {
    it("retrieves registered agent", async () => {
      const identity = createAgentIdentity("agent-1", "user@example.com");
      await registry.register(identity);

      const retrieved = await registry.get("agent-1");

      expect(retrieved).toEqual(identity);
    });

    it("returns null for unknown agent", async () => {
      const retrieved = await registry.get("unknown");

      expect(retrieved).toBeNull();
    });
  });

  describe("list", () => {
    it("lists all agents", async () => {
      const identity1 = createAgentIdentity("agent-1", "user1@example.com");
      const identity2 = createAgentIdentity("agent-2", "user2@example.com");

      await registry.register(identity1);
      await registry.register(identity2);

      const all = await registry.list();

      expect(all).toHaveLength(2);
      expect(all).toContainEqual(identity1);
      expect(all).toContainEqual(identity2);
    });

    it("filters by principal", async () => {
      const identity1 = createAgentIdentity("agent-1", "user1@example.com");
      const identity2 = createAgentIdentity("agent-2", "user1@example.com");
      const identity3 = createAgentIdentity("agent-3", "user2@example.com");

      await registry.register(identity1);
      await registry.register(identity2);
      await registry.register(identity3);

      const user1Agents = await registry.list("user1@example.com");

      expect(user1Agents).toHaveLength(2);
      expect(user1Agents).toContainEqual(identity1);
      expect(user1Agents).toContainEqual(identity2);
    });

    it("returns empty array when no agents", async () => {
      const all = await registry.list();

      expect(all).toEqual([]);
    });
  });

  describe("deregister", () => {
    it("removes agent", async () => {
      const identity = createAgentIdentity("agent-1", "user@example.com");
      await registry.register(identity);

      await registry.deregister("agent-1");

      const retrieved = await registry.get("agent-1");
      expect(retrieved).toBeNull();
    });

    it("is idempotent - removing non-existent agent is no-op", async () => {
      await registry.deregister("unknown");

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("has", () => {
    it("returns true for registered agent", async () => {
      const identity = createAgentIdentity("agent-1", "user@example.com");
      await registry.register(identity);

      const exists = await registry.has("agent-1");

      expect(exists).toBe(true);
    });

    it("returns false for unknown agent", async () => {
      const exists = await registry.has("unknown");

      expect(exists).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all agents", async () => {
      const identity1 = createAgentIdentity("agent-1", "user@example.com");
      const identity2 = createAgentIdentity("agent-2", "user@example.com");

      await registry.register(identity1);
      await registry.register(identity2);

      registry.clear();

      const all = await registry.list();
      expect(all).toEqual([]);
    });
  });
});

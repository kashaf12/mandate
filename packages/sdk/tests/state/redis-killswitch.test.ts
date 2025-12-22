import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RedisStateManager } from "../../src/state/redis";

describe("RedisStateManager - Kill Switch", () => {
  let manager1: RedisStateManager;
  let manager2: RedisStateManager;

  beforeEach(() => {
    manager1 = new RedisStateManager({
      host: "localhost",
      port: 6379,
      keyPrefix: "test:mandate:",
    });

    manager2 = new RedisStateManager({
      host: "localhost",
      port: 6379,
      keyPrefix: "test:mandate:",
    });
  });

  afterEach(async () => {
    await manager1.remove("agent-1");
    await manager1.close();
    await manager2.close();
  });

  it("broadcasts kill to all servers", async () => {
    // Setup: Two "servers" watching same agent
    let killed1 = false;
    let killed2 = false;
    let reason1 = "";
    let reason2 = "";

    manager1.onKill("agent-1", (reason) => {
      killed1 = true;
      reason1 = reason;
    });

    manager2.onKill("agent-1", (reason) => {
      killed2 = true;
      reason2 = reason;
    });

    // Kill from manager1
    const state = await manager1.get("agent-1", "mandate-1");
    await manager1.kill(state, "Emergency stop");

    // Wait for pub/sub propagation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Both should be notified
    expect(killed1).toBe(true);
    expect(killed2).toBe(true);
    expect(reason1).toBe("Emergency stop");
    expect(reason2).toBe("Emergency stop");
  });

  it("persists kill status in Redis", async () => {
    const state = await manager1.get("agent-1", "mandate-1");
    await manager1.kill(state, "Test kill");

    // Different manager instance should see kill status
    const killed = await manager2.isKilled("agent-1", "mandate-1");
    expect(killed).toBe(true);
  });

  it("unregisters callbacks", async () => {
    let killCount = 0;

    manager1.onKill("agent-1", () => {
      killCount++;
    });

    // Kill once
    const state1 = await manager1.get("agent-1", "mandate-1");
    await manager1.kill(state1, "First kill");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(killCount).toBe(1);

    // Unregister
    manager1.offKill("agent-1");

    // Kill again (should not increment)
    await manager1.remove("agent-1"); // Reset
    const state2 = await manager1.get("agent-1", "mandate-1");
    await manager1.kill(state2, "Second kill");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(killCount).toBe(1); // Still 1
  });
});

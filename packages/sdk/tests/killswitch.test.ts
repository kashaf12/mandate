import { describe, it, expect, beforeEach } from "vitest";
import { KillSwitch } from "../src/killswitch";
import { StateManager } from "../src/state";

describe("KillSwitch", () => {
  let stateManager: StateManager;
  let killSwitch: KillSwitch;

  beforeEach(() => {
    stateManager = new StateManager();
    killSwitch = new KillSwitch(stateManager);
  });

  describe("kill", () => {
    it("kills specific agent", async () => {
      // Initialize state
      await stateManager.get("agent-1", "mandate-1");

      expect(await killSwitch.isKilled("agent-1", "mandate-1")).toBe(false);

      await killSwitch.kill("agent-1", "mandate-1", "Manual termination");

      expect(await killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);
    });

    it("sets kill reason", async () => {
      await stateManager.get("agent-1", "mandate-1");

      await killSwitch.kill("agent-1", "mandate-1", "Detected loop");

      const state = await stateManager.get("agent-1", "mandate-1");
      expect(state.killedReason).toBe("Detected loop");
    });

    it("sets kill timestamp", async () => {
      const before = Date.now();
      await stateManager.get("agent-1", "mandate-1");

      await killSwitch.kill("agent-1", "mandate-1");

      const state = await stateManager.get("agent-1", "mandate-1");
      expect(state.killedAt).toBeGreaterThanOrEqual(before);
      expect(state.killedAt).toBeLessThanOrEqual(Date.now());
    });

    it("does not affect other agents", async () => {
      await stateManager.get("agent-1", "mandate-1");
      await stateManager.get("agent-2", "mandate-2");

      await killSwitch.kill("agent-1", "mandate-1");

      expect(await killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);
      expect(await killSwitch.isKilled("agent-2", "mandate-2")).toBe(false);
    });
  });

  describe("isKilled", () => {
    it("returns false for non-killed agent", async () => {
      await stateManager.get("agent-1", "mandate-1");

      expect(await killSwitch.isKilled("agent-1", "mandate-1")).toBe(false);
    });

    it("returns true for killed agent", async () => {
      await stateManager.get("agent-1", "mandate-1");
      await killSwitch.kill("agent-1", "mandate-1");

      expect(await killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);
    });
  });

  describe("resurrect", () => {
    it("resurrects killed agent", async () => {
      await stateManager.get("agent-1", "mandate-1");
      await killSwitch.kill("agent-1", "mandate-1", "Test kill");

      expect(await killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);

      await killSwitch.resurrect("agent-1", "mandate-1");

      expect(await killSwitch.isKilled("agent-1", "mandate-1")).toBe(false);
    });

    it("clears kill metadata", async () => {
      await stateManager.get("agent-1", "mandate-1");
      await killSwitch.kill("agent-1", "mandate-1", "Test kill");

      await killSwitch.resurrect("agent-1", "mandate-1");

      const state = await stateManager.get("agent-1", "mandate-1");
      expect(state.killedAt).toBeUndefined();
      expect(state.killedReason).toBeUndefined();
    });
  });

  describe("killAll", () => {
    it("throws error in Phase 1", () => {
      expect(() => killSwitch.killAll("Maintenance")).toThrow(
        "not implemented in Phase 1"
      );
    });
  });
});

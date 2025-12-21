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
    it("kills specific agent", () => {
      // Initialize state
      stateManager.get("agent-1", "mandate-1");

      expect(killSwitch.isKilled("agent-1", "mandate-1")).toBe(false);

      killSwitch.kill("agent-1", "mandate-1", "Manual termination");

      expect(killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);
    });

    it("sets kill reason", () => {
      stateManager.get("agent-1", "mandate-1");

      killSwitch.kill("agent-1", "mandate-1", "Detected loop");

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.killedReason).toBe("Detected loop");
    });

    it("sets kill timestamp", () => {
      const before = Date.now();
      stateManager.get("agent-1", "mandate-1");

      killSwitch.kill("agent-1", "mandate-1");

      const state = stateManager.get("agent-1", "mandate-1");
      expect(state.killedAt).toBeGreaterThanOrEqual(before);
      expect(state.killedAt).toBeLessThanOrEqual(Date.now());
    });

    it("does not affect other agents", () => {
      stateManager.get("agent-1", "mandate-1");
      stateManager.get("agent-2", "mandate-2");

      killSwitch.kill("agent-1", "mandate-1");

      expect(killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);
      expect(killSwitch.isKilled("agent-2", "mandate-2")).toBe(false);
    });
  });

  describe("isKilled", () => {
    it("returns false for non-killed agent", () => {
      stateManager.get("agent-1", "mandate-1");

      expect(killSwitch.isKilled("agent-1", "mandate-1")).toBe(false);
    });

    it("returns true for killed agent", () => {
      stateManager.get("agent-1", "mandate-1");
      killSwitch.kill("agent-1", "mandate-1");

      expect(killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);
    });
  });

  describe("resurrect", () => {
    it("resurrects killed agent", () => {
      stateManager.get("agent-1", "mandate-1");
      killSwitch.kill("agent-1", "mandate-1", "Test kill");

      expect(killSwitch.isKilled("agent-1", "mandate-1")).toBe(true);

      killSwitch.resurrect("agent-1", "mandate-1");

      expect(killSwitch.isKilled("agent-1", "mandate-1")).toBe(false);
    });

    it("clears kill metadata", () => {
      stateManager.get("agent-1", "mandate-1");
      killSwitch.kill("agent-1", "mandate-1", "Test kill");

      killSwitch.resurrect("agent-1", "mandate-1");

      const state = stateManager.get("agent-1", "mandate-1");
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

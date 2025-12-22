import type { StateManager } from "./state";

/**
 * Kill switch for emergency agent termination.
 *
 * Provides convenient methods for killing agents globally or individually.
 */
export class KillSwitch {
  constructor(private stateManager: StateManager) {}

  /**
   * Kill a specific agent.
   *
   * @param agentId - Agent to kill
   * @param reason - Why the agent was killed
   *
   * @example
   * ```typescript
   * killSwitch.kill('agent-1', 'Detected malicious behavior');
   * ```
   */
  async kill(
    agentId: string,
    mandateId: string,
    reason?: string
  ): Promise<void> {
    const state = await this.stateManager.get(agentId, mandateId);
    await this.stateManager.kill(state, reason);
  }

  /**
   * Kill all agents.
   *
   * WARNING: This kills ALL agents managed by this StateManager instance.
   * In distributed systems, this only affects agents in this process.
   *
   * @param reason - Why all agents were killed
   *
   * @example
   * ```typescript
   * killSwitch.killAll('System maintenance');
   * ```
   */
  killAll(_reason?: string): void {
    // This is a limitation of Phase 1: we don't track all agents
    // In Phase 3, this would query a central registry
    throw new Error(
      "killAll() not implemented in Phase 1. " +
        "To kill all agents, you must kill them individually. " +
        "This will be supported in Phase 3 when centralized state is added."
    );
  }

  /**
   * Check if an agent is killed.
   *
   * @param agentId - Agent to check
   * @param mandateId - Mandate ID
   * @returns true if agent is killed
   */
  async isKilled(agentId: string, mandateId: string): Promise<boolean> {
    return await this.stateManager.isKilled(agentId, mandateId);
  }

  /**
   * Resurrect a killed agent (for testing/recovery).
   *
   * @param agentId - Agent to resurrect
   * @param mandateId - Mandate ID
   */
  async resurrect(agentId: string, mandateId: string): Promise<void> {
    const state = await this.stateManager.get(agentId, mandateId);
    state.killed = false;
    state.killedAt = undefined;
    state.killedReason = undefined;
  }
}

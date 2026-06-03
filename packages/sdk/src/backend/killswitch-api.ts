import type { BackendClient } from "./client";
import type {
  KillStatusResponse,
  KillAgentRequest,
  KillAgentResponse,
} from "./killswitch-types";

/**
 * High-level API for kill switch operations.
 *
 * Kill switch provides emergency termination of agents.
 * When an agent is killed:
 * - All future actions are immediately blocked
 * - The SDK should stop making requests
 * - The backend propagates kill status globally
 *
 * Use cases:
 * - Runaway costs (agent stuck in loop)
 * - Security incident (compromised agent)
 * - Deployment rollback (revert to previous version)
 */
export class KillSwitchAPI {
  constructor(private client: BackendClient) {}

  /**
   * Check if an agent has been killed.
   *
   * Returns kill status with optional timestamp and reason.
   *
   * @param agentId - Agent identifier
   * @returns Kill status response
   *
   * @example
   * ```typescript
   * const status = await killSwitchAPI.check('agent-123');
   * if (status.killed) {
   *   console.log(`Agent killed at ${status.killedAt}: ${status.reason}`);
   * }
   * ```
   */
  async check(agentId: string): Promise<KillStatusResponse> {
    return await this.client.get<KillStatusResponse>(
      `/agents/${agentId}/kill-status`
    );
  }

  /**
   * Kill an agent (emergency termination).
   *
   * This is a permanent action. The agent cannot be resurrected
   * through the API (requires manual intervention in backend).
   *
   * @param agentId - Agent identifier
   * @param reason - Human-readable reason for kill
   * @param killedBy - Optional: who triggered the kill
   * @returns Kill confirmation
   *
   * @example
   * ```typescript
   * const result = await killSwitchAPI.kill(
   *   'agent-123',
   *   'Runaway costs: infinite loop detected',
   *   'admin@company.com'
   * );
   * console.log(`Agent killed at ${result.killedAt}`);
   * ```
   */
  async kill(
    agentId: string,
    reason: string,
    killedBy?: string
  ): Promise<KillAgentResponse> {
    const request: KillAgentRequest = {
      reason,
      killedBy,
    };

    return await this.client.post<KillAgentResponse>(
      `/agents/${agentId}/kill`,
      request
    );
  }

  /**
   * Check if agent is killed (simple boolean check).
   *
   * Convenience method that returns just the boolean status.
   *
   * @param agentId - Agent identifier
   * @returns true if agent is killed, false otherwise
   *
   * @example
   * ```typescript
   * if (await killSwitchAPI.isKilled('agent-123')) {
   *   throw new Error('Agent has been terminated');
   * }
   * ```
   */
  async isKilled(agentId: string): Promise<boolean> {
    const status = await this.check(agentId);
    return status.killed;
  }
}

/**
 * Backend API response for kill status check.
 */
export interface KillStatusResponse {
  agentId: string;
  killed: boolean;
  killedAt?: string; // ISO 8601 timestamp
  reason?: string;
  killedBy?: string;
}

/**
 * Request body for killing an agent.
 */
export interface KillAgentRequest {
  reason: string;
  killedBy?: string;
}

/**
 * Backend API response for kill operation.
 */
export interface KillAgentResponse {
  agentId: string;
  killed: true;
  killedAt: string; // ISO 8601 timestamp
  reason: string;
  killedBy?: string;
}

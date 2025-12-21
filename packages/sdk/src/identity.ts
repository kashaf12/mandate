/**
 * Agent Identity
 * 
 * Represents a stable agent identity that persists across restarts.
 * 
 * Design principles:
 * - agentId is stable (user-provided or UUID)
 * - principal tracks ownership (required for Phase 3 multi-tenant)
 * - metadata allows extension without schema changes
 */
export interface AgentIdentity {
  agentId: string;
  principal: string;
  createdAt: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create agent identity with defaults.
 */
export function createAgentIdentity(
  agentId: string,
  principal: string,
  options?: {
    description?: string;
    metadata?: Record<string, unknown>;
  }
): AgentIdentity {
  return {
    agentId,
    principal,
    createdAt: Date.now(),
    description: options?.description,
    metadata: options?.metadata
  };
}

/**
 * Generate unique agent ID.
 */
export function generateAgentId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `agent-${timestamp}-${random}`;
}

/**
 * Validate agent identity.
 */
export function validateAgentIdentity(identity: AgentIdentity): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!identity.agentId || identity.agentId.trim() === '') {
    errors.push('agentId is required');
  }

  if (!identity.principal || identity.principal.trim() === '') {
    errors.push('principal is required');
  }

  if (!identity.createdAt || identity.createdAt <= 0) {
    errors.push('createdAt must be a positive timestamp');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}


import type { AgentIdentity } from "./identity";

/**
 * Agent Registry
 *
 * Tracks all agents in the system.
 *
 * Phase 2: MemoryAgentRegistry (local, in-process)
 * Phase 3: RedisAgentRegistry (distributed, shared)
 *
 * Design principles:
 * - Interface allows backend swapping
 * - All methods async (prepares for distributed)
 * - Idempotent operations (safe retries)
 */
export interface AgentRegistry {
  /**
   * Register agent identity.
   * Idempotent - re-registering same agent updates metadata.
   */
  register(identity: AgentIdentity): Promise<void>;

  /**
   * Get agent identity by ID.
   * Returns null if not found.
   */
  get(agentId: string): Promise<AgentIdentity | null>;

  /**
   * List all agents, optionally filtered by principal.
   */
  list(principal?: string): Promise<AgentIdentity[]>;

  /**
   * Deregister agent.
   * Idempotent - deregistering non-existent agent is no-op.
   */
  deregister(agentId: string): Promise<void>;

  /**
   * Check if agent is registered.
   */
  has(agentId: string): Promise<boolean>;
}

/**
 * In-memory agent registry (Phase 2).
 *
 * Limitations:
 * - Not shared across processes
 * - Lost on restart
 * - Phase 3 will replace with Redis
 */
export class MemoryAgentRegistry implements AgentRegistry {
  private agents = new Map<string, AgentIdentity>();

  async register(identity: AgentIdentity): Promise<void> {
    this.agents.set(identity.agentId, identity);
  }

  async get(agentId: string): Promise<AgentIdentity | null> {
    return this.agents.get(agentId) || null;
  }

  async list(principal?: string): Promise<AgentIdentity[]> {
    const all = Array.from(this.agents.values());

    if (!principal) {
      return all;
    }

    return all.filter((identity) => identity.principal === principal);
  }

  async deregister(agentId: string): Promise<void> {
    this.agents.delete(agentId);
  }

  async has(agentId: string): Promise<boolean> {
    return this.agents.has(agentId);
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.agents.clear();
  }
}

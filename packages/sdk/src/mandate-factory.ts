import type {
  Mandate,
  RateLimit,
  ChargingPolicy,
  ToolPolicy,
  ProviderPricing,
} from "./types";
import {
  generateAgentId,
  createAgentIdentity,
  type AgentIdentity,
} from "./identity";

/**
 * Mandate Factory
 *
 * Programmatic mandate creation with sensible defaults.
 */

export interface MandateOptions {
  id?: string; // Mandate ID (auto-generated if not provided)
  agentId?: string; // Auto-generated if not provided
  principal: string; // Required
  description?: string;

  // Cost limits
  maxCostTotal?: number;
  maxCostPerCall?: number;

  // Rate limiting
  rateLimit?: RateLimit;

  // Tool permissions
  allowedTools?: string[];
  deniedTools?: string[];

  // Tool-specific policies
  toolPolicies?: Record<string, ToolPolicy>;

  // Temporal bounds
  expiresAt?: number;
  expiresInMs?: number; // Convenience: expiresAt = now + expiresInMs

  // Defaults
  defaultChargingPolicy?: ChargingPolicy;

  // Custom pricing
  customPricing?: ProviderPricing;
}

/**
 * Create a mandate with defaults.
 */
export function createMandate(options: MandateOptions): Mandate {
  const agentId = options.agentId || generateAgentId();
  const mandateId =
    options.id ||
    `mandate-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = Date.now();

  // Calculate expiration
  let expiresAt: number | undefined;
  if (options.expiresAt) {
    expiresAt = options.expiresAt;
  } else if (options.expiresInMs) {
    expiresAt = now + options.expiresInMs;
  }

  // Create identity
  const identity: AgentIdentity = createAgentIdentity(
    agentId,
    options.principal,
    {
      description: options.description,
    }
  );

  return {
    version: 1,
    id: mandateId,
    agentId,
    principal: options.principal,
    identity,
    issuedAt: now,
    expiresAt,
    maxCostTotal: options.maxCostTotal,
    maxCostPerCall: options.maxCostPerCall,
    rateLimit: options.rateLimit,
    allowedTools: options.allowedTools,
    deniedTools: options.deniedTools,
    toolPolicies: options.toolPolicies,
    defaultChargingPolicy: options.defaultChargingPolicy,
    customPricing: options.customPricing,
  };
}

/**
 * Mandate templates for common use cases.
 */
export const MandateTemplates = {
  /**
   * Restricted agent - minimal permissions.
   */
  restricted(principal: string, options?: Partial<MandateOptions>): Mandate {
    return createMandate({
      principal,
      maxCostTotal: 1.0,
      maxCostPerCall: 0.1,
      allowedTools: ["read_*"],
      deniedTools: ["delete_*", "execute_*", "drop_*"],
      expiresInMs: 3600000, // 1 hour
      ...options,
    });
  },

  /**
   * Development agent - permissive for testing.
   */
  development(principal: string, options?: Partial<MandateOptions>): Mandate {
    return createMandate({
      principal,
      maxCostTotal: 10.0,
      allowedTools: ["*"],
      deniedTools: ["drop_*"],
      expiresInMs: 86400000, // 24 hours
      ...options,
    });
  },

  /**
   * Production agent - balanced permissions.
   */
  production(principal: string, options?: Partial<MandateOptions>): Mandate {
    return createMandate({
      principal,
      maxCostTotal: 100.0,
      maxCostPerCall: 5.0,
      rateLimit: { maxCalls: 1000, windowMs: 3600000 },
      allowedTools: ["read_*", "search_*", "send_*"],
      deniedTools: ["delete_*", "execute_*", "drop_*", "alter_*"],
      defaultChargingPolicy: { type: "SUCCESS_BASED" },
      ...options,
    });
  },

  /**
   * Temporary agent - short-lived, limited.
   */
  temporary(principal: string, options?: Partial<MandateOptions>): Mandate {
    return createMandate({
      principal,
      maxCostTotal: 0.5,
      maxCostPerCall: 0.05,
      rateLimit: { maxCalls: 10, windowMs: 60000 },
      expiresInMs: 300000, // 5 minutes
      ...options,
    });
  },
};

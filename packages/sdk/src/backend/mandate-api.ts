import type { BackendClient } from "./client";
import type { Mandate } from "../types";
import type {
  BackendMandateResponse,
  BackendMandateDetail,
  IssueMandateRequest,
} from "./mandate-types";

/**
 * High-level API for mandate operations.
 *
 * Handles:
 * - Issuing new mandates
 * - Fetching mandate details
 * - Converting backend response format to SDK Mandate format
 */
export class MandateAPI {
  constructor(private client: BackendClient) {}

  /**
   * Issue a new mandate for an agent.
   *
   * The backend evaluates rules based on context, composes policies,
   * and returns a mandate with effective authority.
   *
   * @param agentId - Agent identifier (implicit from API key)
   * @param context - Context for policy matching (e.g., { user_tier: 'free' })
   * @returns SDK Mandate object ready for enforcement
   *
   * @example
   * ```typescript
   * const mandate = await mandateAPI.issue('agent-123', {
   *   user_tier: 'free',
   *   environment: 'production'
   * });
   * ```
   */
  async issue(
    agentId: string,
    context: Record<string, string>
  ): Promise<Mandate> {
    const request: IssueMandateRequest = { context };

    const response = await this.client.post<BackendMandateResponse>(
      "/mandates/issue",
      request
    );

    return this.convertToMandate(response, agentId);
  }

  /**
   * Get mandate details (for debugging/admin).
   *
   * Returns complete mandate information including matched rules
   * and applied policies.
   *
   * @param mandateId - Mandate identifier
   * @returns Detailed mandate information
   */
  async get(mandateId: string): Promise<BackendMandateDetail> {
    return await this.client.get<BackendMandateDetail>(
      `/mandates/${mandateId}`
    );
  }

  /**
   * Convert backend mandate response to SDK Mandate format.
   *
   * Backend returns ISO timestamps and nested authority structure.
   * SDK expects epoch timestamps and flat authority structure.
   */
  private convertToMandate(
    response: BackendMandateResponse,
    agentId: string
  ): Mandate {
    const now = Date.now();
    const expiresAt = new Date(response.expiresAt).getTime();

    // Extract authority fields from backend response
    const authority = response.effectiveAuthority;

    // Build SDK Mandate object
    const mandate: Mandate = {
      id: response.mandateId,
      version: 1,
      agentId,
      issuedAt: now,
      expiresAt,

      // Core authority fields
      allowedTools: authority.allowedTools || [],
      deniedTools: authority.deniedTools || [],
      toolPolicies: authority.toolPolicies || {},

      // Cost limits
      maxCostTotal: authority.maxCostTotal,
      maxCostPerCall: authority.maxCostPerCall,

      // Rate limits
      rateLimit: authority.rateLimit,

      // Charging policy
      defaultChargingPolicy: authority.defaultChargingPolicy,

      // Custom pricing
      customPricing: authority.customPricing,

      // Additional authority fields
      ...this.extractAdditionalAuthority(authority),
    };

    return mandate;
  }

  /**
   * Extract any additional authority fields that might be in the backend response
   * but not explicitly mapped above.
   */
  private extractAdditionalAuthority(
    authority: Record<string, any>
  ): Partial<Mandate> {
    const extracted: Partial<Mandate> = {};

    // List of known fields we've already handled
    const knownFields = new Set([
      "allowedTools",
      "deniedTools",
      "toolPolicies",
      "maxCostTotal",
      "maxCostPerCall",
      "rateLimit",
      "defaultChargingPolicy",
      "customPricing",
      // Backend-specific fields that don't map to Mandate
      "executionLimits",
      "modelConfig",
    ]);

    // Copy any additional fields (future-proofing)
    // Note: TypeScript will complain about unknown properties, but we allow them
    // for extensibility. In practice, these will be ignored by the SDK.
    for (const [key, value] of Object.entries(authority)) {
      if (!knownFields.has(key)) {
        // Only copy primitive/compatible types to avoid type errors
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean" ||
          Array.isArray(value) ||
          (typeof value === "object" && value !== null)
        ) {
          (extracted as Record<string, any>)[key] = value;
        }
      }
    }

    return extracted;
  }
}

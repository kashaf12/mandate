/**
 * Backend API response for mandate issuance.
 * This is what the backend returns.
 */
export interface BackendMandateResponse {
  mandateId: string;
  effectiveAuthority: Record<string, any>;
  expiresAt: string; // ISO 8601 timestamp
}

/**
 * Backend API response for mandate details (admin/debug endpoint).
 */
export interface BackendMandateDetail {
  mandateId: string;
  agentId: string;
  context: Record<string, string>;
  matchedRules: Array<{ ruleId: string; ruleVersion: number }>;
  appliedPolicies: Array<{ policyId: string; policyVersion: number }>;
  effectiveAuthority: Record<string, any>;
  issuedAt: string; // ISO 8601 timestamp
  expiresAt: string; // ISO 8601 timestamp
}

/**
 * Request body for mandate issuance.
 */
export interface IssueMandateRequest {
  context: Record<string, string>;
}

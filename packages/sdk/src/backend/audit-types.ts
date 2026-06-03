/**
 * Backend API request for bulk audit log creation.
 */
export interface BulkCreateAuditLogsRequest {
  logs: BackendAuditLog[];
}

/**
 * Backend API response for bulk audit log creation.
 */
export interface BulkCreateAuditLogsResponse {
  inserted: number;
}

/**
 * Backend audit log format (what the backend expects).
 */
export interface BackendAuditLog {
  actionId: string;
  timestamp: string; // ISO 8601
  actionType: "tool_call" | "llm_call" | "agent_call" | "mcp_call";
  toolName?: string;
  decision: "ALLOW" | "BLOCK";
  reason: string;
  estimatedCost?: number;
  actualCost?: number;
  cumulativeCost?: number;
  context?: Record<string, unknown>;
  matchedRules?: Array<{ rule_id: string; rule_version: number }>;
  metadata?: Record<string, unknown>;
}

/**
 * Backend API request for querying audit logs.
 */
export interface QueryAuditLogsRequest {
  decision?: "ALLOW" | "BLOCK";
  from?: string; // ISO 8601
  to?: string; // ISO 8601
  limit?: number;
}

/**
 * Backend audit log response (what the backend returns when querying).
 */
export interface BackendAuditLogResponse {
  id: string;
  agentId: string;
  actionId: string;
  timestamp: string; // ISO 8601
  actionType: string;
  toolName?: string;
  decision: "ALLOW" | "BLOCK";
  reason: string;
  estimatedCost?: number;
  actualCost?: number;
  cumulativeCost?: number;
  metadata?: Record<string, unknown>;
  createdAt: string; // ISO 8601
}

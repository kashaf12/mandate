import type { BackendClient } from "./client";
import type { AuditEntry } from "../types";
import type {
  BulkCreateAuditLogsRequest,
  BulkCreateAuditLogsResponse,
  BackendAuditLog,
  BackendAuditLogResponse,
} from "./audit-types";

/**
 * High-level API for audit log operations.
 *
 * Handles:
 * - Bulk syncing audit logs to backend
 * - Querying audit logs from backend
 * - Converting SDK AuditEntry format to backend format
 */
export class AuditAPI {
  constructor(private client: BackendClient) {}

  /**
   * Bulk create audit logs in backend.
   *
   * Converts SDK AuditEntry format to backend format and syncs.
   *
   * @param logs - Array of SDK audit entries
   * @returns Number of logs inserted
   *
   * @example
   * ```typescript
   * const result = await auditAPI.bulkCreate([
   *   { id: 'audit-1', timestamp: Date.now(), ... },
   *   { id: 'audit-2', timestamp: Date.now(), ... }
   * ]);
   * console.log(`Inserted ${result.inserted} logs`);
   * ```
   */
  async bulkCreate(logs: AuditEntry[]): Promise<BulkCreateAuditLogsResponse> {
    if (logs.length === 0) {
      return { inserted: 0 };
    }

    const backendLogs = logs.map((log) => this.convertToBackendFormat(log));

    const request: BulkCreateAuditLogsRequest = {
      logs: backendLogs,
    };

    return await this.client.post<BulkCreateAuditLogsResponse>(
      "/audit/bulk",
      request
    );
  }

  /**
   * Query audit logs from backend.
   *
   * @param params - Query parameters
   * @returns Array of audit log responses
   *
   * @example
   * ```typescript
   * const logs = await auditAPI.query({
   *   decision: 'BLOCK',
   *   from: new Date('2025-12-28'),
   *   limit: 100
   * });
   * ```
   */
  async query(
    params: {
      decision?: "ALLOW" | "BLOCK";
      from?: Date;
      to?: Date;
      limit?: number;
    } = {}
  ): Promise<BackendAuditLogResponse[]> {
    const queryParams = new URLSearchParams();

    if (params.decision) {
      queryParams.set("decision", params.decision);
    }
    if (params.from) {
      queryParams.set("from", params.from.toISOString());
    }
    if (params.to) {
      queryParams.set("to", params.to.toISOString());
    }
    if (params.limit) {
      queryParams.set("limit", params.limit.toString());
    }

    const queryString = queryParams.toString();
    const endpoint = queryString ? `/audit?${queryString}` : "/audit";

    return await this.client.get<BackendAuditLogResponse[]>(endpoint);
  }

  /**
   * Convert SDK AuditEntry to backend format.
   *
   * Key conversions:
   * - timestamp: epoch ms → ISO 8601
   * - action: SDK action type → backend action type
   * - tool: SDK tool name → backend toolName
   * - Flatten nested metadata
   */
  private convertToBackendFormat(entry: AuditEntry): BackendAuditLog {
    return {
      actionId: entry.actionId,
      timestamp: new Date(entry.timestamp).toISOString(),
      actionType: this.mapActionType(entry.action),
      toolName: entry.tool,
      decision: entry.decision === "DEFER" ? "BLOCK" : entry.decision,
      reason: entry.reason,
      estimatedCost: entry.estimatedCost,
      actualCost: entry.actualCost,
      cumulativeCost: entry.cumulativeCost,
      context: this.buildContext(entry),
      matchedRules: [], // TODO: Extract from mandate context when available
      metadata: this.buildMetadata(entry),
    };
  }

  /**
   * Map SDK action types to backend action types.
   */
  private mapActionType(
    action: string
  ): "tool_call" | "llm_call" | "agent_call" | "mcp_call" {
    switch (action) {
      case "tool_call":
        return "tool_call";
      case "llm_call":
        return "llm_call";
      case "agent_call":
        return "agent_call";
      case "mcp_call":
        return "mcp_call";
      default:
        return "tool_call"; // Default fallback
    }
  }

  /**
   * Build context object for backend.
   * Includes correlation IDs and other contextual data.
   */
  private buildContext(entry: AuditEntry): Record<string, unknown> {
    const context: Record<string, unknown> = {};

    if (entry.traceId) {
      context.traceId = entry.traceId;
    }
    if (entry.parentActionId) {
      context.parentActionId = entry.parentActionId;
    }
    if (entry.idempotencyKey) {
      context.idempotencyKey = entry.idempotencyKey;
    }
    if (entry.provider) {
      context.provider = entry.provider;
    }
    if (entry.model) {
      context.model = entry.model;
    }
    if (entry.costType) {
      context.costType = entry.costType;
    }

    return context;
  }

  /**
   * Build metadata object for backend.
   * Includes block codes, hashes, and custom metadata.
   */
  private buildMetadata(entry: AuditEntry): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (entry.blockCode) {
      metadata.blockCode = entry.blockCode;
    }
    if (entry.hash) {
      metadata.hash = entry.hash;
    }
    if (entry.previousHash) {
      metadata.previousHash = entry.previousHash;
    }

    // Include custom metadata
    if (entry.metadata) {
      Object.assign(metadata, entry.metadata);
    }

    return metadata;
  }
}

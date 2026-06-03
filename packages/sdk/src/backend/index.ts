/**
 * Backend integration for Mandate SDK.
 *
 * Provides unified API for interacting with Mandate Cloud backend:
 * - Mandate issuance (dynamic policy-driven authority)
 * - Audit log syncing (compliance and debugging)
 * - Kill switch operations (emergency termination)
 * - Health checks (backend availability)
 *
 * @example
 * ```typescript
 * import { MandateBackend } from '@mandate/sdk/backend';
 *
 * const backend = new MandateBackend({
 *   apiKey: 'sk-org-abc-xxx',
 *   backendUrl: 'https://api.mandate.io',
 *   agentId: 'agent-123',
 * });
 *
 * // Check backend health
 * const health = await backend.health();
 * console.log('Backend status:', health.status);
 *
 * // Issue mandate
 * const mandate = await backend.mandates.issue('agent-123', {
 *   user_tier: 'free',
 *   environment: 'production'
 * });
 *
 * // Sync audit logs
 * await backend.audit.bulkCreate(logs);
 *
 * // Check kill status
 * if (await backend.killSwitch.isKilled('agent-123')) {
 *   throw new Error('Agent has been terminated');
 * }
 * ```
 */

// Main unified API (primary export)
export { MandateBackend } from "./backend";
export type { MandateBackendConfig, HealthCheckResponse } from "./backend";

// Individual APIs (for advanced usage)
export { BackendClient } from "./client";
export type { BackendClientConfig } from "./types";

// Mandate API
export { MandateAPI } from "./mandate-api";
export type {
  BackendMandateResponse,
  BackendMandateDetail,
  IssueMandateRequest,
} from "./mandate-types";

// Audit API
export { AuditAPI } from "./audit-api";
export type {
  BulkCreateAuditLogsRequest,
  BulkCreateAuditLogsResponse,
  BackendAuditLog,
  QueryAuditLogsRequest,
  BackendAuditLogResponse,
} from "./audit-types";

// Kill Switch API
export { KillSwitchAPI } from "./killswitch-api";
export type {
  KillStatusResponse,
  KillAgentRequest,
  KillAgentResponse,
} from "./killswitch-types";

// Mandate Cache
export { MandateCache } from "./mandate-cache";
export type { MandateCacheConfig } from "./mandate-cache";

// Mandate Manager
export { MandateManager } from "./mandate-manager";
export type { MandateManagerConfig } from "./mandate-manager";

// Audit Batcher
export { AuditBatcher } from "./audit-batcher";
export type { AuditBatcherConfig, BatcherStats } from "./audit-batcher";

// Errors
export {
  BackendError,
  BackendUnavailableError,
  BackendClientError,
  BackendServerError,
  BackendTimeoutError,
} from "./errors";

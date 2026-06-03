import { BackendClient } from "./client";
import type { BackendClientConfig } from "./types";
import { MandateAPI } from "./mandate-api";
import { AuditAPI } from "./audit-api";
import { KillSwitchAPI } from "./killswitch-api";

/**
 * Configuration for MandateBackend.
 * Extends BackendClientConfig with backend-specific options.
 */
export interface MandateBackendConfig extends BackendClientConfig {
  /**
   * Agent ID (for health check and default operations).
   */
  agentId?: string;
}

/**
 * Health check response from backend.
 */
export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  version?: string;
  uptime?: number;
}

/**
 * Unified backend API for Mandate Cloud.
 *
 * Provides single entry point for all backend operations:
 * - Mandate issuance and management
 * - Audit log syncing and querying
 * - Kill switch operations
 * - Health checks
 *
 * @example
 * ```typescript
 * const backend = new MandateBackend({
 *   apiKey: 'sk-org-abc-xxx',
 *   backendUrl: 'http://localhost:3000',
 *   agentId: 'agent-123',
 * });
 *
 * // Issue mandate
 * const mandate = await backend.mandates.issue('agent-123', { user_tier: 'free' });
 *
 * // Sync audit logs
 * await backend.audit.bulkCreate(logs);
 *
 * // Check kill status
 * const isKilled = await backend.killSwitch.isKilled('agent-123');
 *
 * // Health check
 * const health = await backend.health();
 * ```
 */
export class MandateBackend {
  private client: BackendClient;
  private baseUrl: string;

  /**
   * Mandate API for issuing and managing mandates.
   */
  public readonly mandates: MandateAPI;

  /**
   * Audit API for syncing and querying audit logs.
   */
  public readonly audit: AuditAPI;

  /**
   * Kill Switch API for emergency agent termination.
   */
  public readonly killSwitch: KillSwitchAPI;

  /**
   * Agent ID (if provided in config).
   */
  public readonly agentId?: string;

  constructor(config: MandateBackendConfig) {
    this.agentId = config.agentId;
    this.baseUrl = config.backendUrl.replace(/\/$/, ""); // Remove trailing slash

    // Create shared HTTP client
    this.client = new BackendClient({
      apiKey: config.apiKey,
      backendUrl: config.backendUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      headers: config.headers,
    });

    // Initialize APIs with shared client
    this.mandates = new MandateAPI(this.client);
    this.audit = new AuditAPI(this.client);
    this.killSwitch = new KillSwitchAPI(this.client);
  }

  /**
   * Health check endpoint.
   *
   * Verifies backend is reachable and operational.
   * Use this before critical operations or during startup.
   *
   * @returns Health status response
   * @throws BackendUnavailableError if backend is down
   *
   * @example
   * ```typescript
   * const health = await backend.health();
   * if (health.status !== 'ok') {
   *   console.warn('Backend degraded:', health);
   * }
   * ```
   */
  async health(): Promise<HealthCheckResponse> {
    return await this.client.get<HealthCheckResponse>("/health");
  }

  /**
   * Check if backend is available.
   *
   * Convenience method that returns boolean instead of throwing.
   *
   * @returns true if backend is healthy, false otherwise
   *
   * @example
   * ```typescript
   * if (await backend.isAvailable()) {
   *   // Safe to make requests
   * } else {
   *   // Fallback to cached data
   * }
   * ```
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === "ok" || health.status === "degraded";
    } catch {
      return false;
    }
  }

  /**
   * Get backend base URL.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

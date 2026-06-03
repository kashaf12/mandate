import { PolicyEngine } from "./policy";
import type { StateManager as IStateManager } from "./state/types";
import { createStateManager } from "./state/factory";
import type { StateManagerConfig } from "./state/types";
import { KillSwitch } from "./killswitch";
// Audit logger imports removed - replaced by AuditBatcher in Layer 10
import { executeWithMandate } from "./executor";
import {
  estimateTokensFromMessages,
  calculateMaxOutputTokens,
  createLLMAction,
} from "./helpers";
import type { Mandate, Action } from "./types";
import { getPricing } from "./pricing";
import type { MandateCacheConfig } from "./backend/mandate-cache";
import type { AuditBatcherConfig } from "./backend/audit-batcher";
import { MandateBackend } from "./backend";
import { MandateManager } from "./backend/mandate-manager";
import { AuditBatcher } from "./backend/audit-batcher";

/**
 * Audit logger configuration.
 * @deprecated Replaced by AuditBatcher in backend integration
 */
export type AuditLoggerConfig =
  | "console" // Log to console
  | "memory" // Store in memory (testing)
  | "none" // No logging
  | { file: string }; // Log to file

/**
 * Configuration for MandateClient with backend integration.
 *
 * The client fetches mandates dynamically from the backend based on
 * agent identity and context, rather than using hardcoded mandates.
 *
 * @example
 * ```typescript
 * const client = await MandateClient.create({
 *   agentId: 'agent-123',
 *   apiKey: 'sk-org-abc-xxx',
 *   backendUrl: 'http://localhost:3000',
 *   context: {
 *     user_tier: 'free',
 *     environment: 'production'
 *   }
 * });
 * ```
 */
export interface MandateClientConfig {
  // ============================================
  // REQUIRED: Backend Integration
  // ============================================

  /**
   * Agent identifier.
   *
   * Must be registered in the backend.
   * Format: agent-{id}
   *
   * @example 'agent-123'
   */
  agentId: string;

  /**
   * API key for backend authentication.
   *
   * Format: sk-{orgId}-{random}
   * Obtained from backend on agent registration.
   *
   * @example 'sk-org-abc123-a1b2c3d4e5f6'
   */
  apiKey: string;

  /**
   * Backend API URL.
   *
   * @example 'http://localhost:3000'
   * @example 'https://api.mandate.io'
   */
  backendUrl: string;

  /**
   * Context for mandate issuance.
   *
   * This determines which policies apply via backend rule matching.
   * Context is sent to backend on mandate fetch.
   *
   * Common context fields:
   * - user_tier: 'free' | 'pro' | 'enterprise'
   * - environment: 'development' | 'staging' | 'production'
   * - team_id: string
   * - deployment: 'internal' | 'customer-facing'
   *
   * @example { user_tier: 'free', environment: 'production' }
   */
  context: Record<string, string>;

  // ============================================
  // OPTIONAL: Advanced Configuration
  // ============================================

  /**
   * State manager configuration.
   *
   * Default: in-memory
   *
   * Options:
   * - 'memory': In-memory (default)
   * - 'redis': Redis-backed (for distributed systems)
   * - Custom IStateManager instance
   * - StateManagerConfig object
   */
  stateManager?: IStateManager | StateManagerConfig;

  /**
   * Backend request timeout in milliseconds.
   *
   * Default: 5000 (5 seconds)
   */
  timeout?: number;

  /**
   * Maximum number of retries for failed backend requests.
   *
   * Default: 3
   *
   * Retry logic:
   * - Network errors: retry
   * - 5xx errors: retry
   * - 4xx errors: no retry
   */
  maxRetries?: number;

  /**
   * Mandate cache configuration.
   *
   * Default: { ttl: 300000, maxSize: 100 }
   *
   * Cache improves performance by avoiding backend calls for
   * repeated mandate fetches with same context.
   */
  cacheConfig?: MandateCacheConfig;

  /**
   * Audit batcher configuration.
   *
   * Default: { batchSize: 100, flushInterval: 30000, maxBufferSize: 1000 }
   *
   * Batcher reduces backend load by batching audit logs.
   */
  batcherConfig?: Partial<AuditBatcherConfig>;

  /**
   * Enable automatic mandate refresh.
   *
   * Default: true
   *
   * When enabled, mandate is refreshed in background every
   * `refreshInterval` milliseconds to ensure policies stay fresh.
   */
  autoRefresh?: boolean;

  /**
   * Mandate refresh interval in milliseconds.
   *
   * Default: 240000 (4 minutes)
   *
   * Should be less than cache TTL (5 minutes) to ensure
   * cache never expires before refresh.
   */
  refreshInterval?: number;
}

/**
 * High-level client for Mandate SDK.
 *
 * Encapsulates PolicyEngine, StateManager, KillSwitch, and AuditLogger
 * to provide a simple, developer-friendly API.
 *
 * @example
 * ```typescript
 * // Create client with backend integration
 * const client = await MandateClient.create({
 *   agentId: 'agent-123',
 *   apiKey: 'sk-org-abc-xxx',
 *   backendUrl: 'http://localhost:3000',
 *   context: {
 *     user_tier: 'free',
 *     environment: 'production'
 *   }
 * });
 *
 * // Execute actions (mandate fetched from backend automatically)
 * const action = createToolAction('agent-123', 'send_email', { to: 'user@example.com' });
 * const result = await client.executeTool(action, () => sendEmail());
 *
 * // Check state
 * console.log('Cost:', await client.getCost());
 * console.log('Calls:', await client.getCallCount());
 *
 * // Emergency stop
 * await client.kill('Detected loop');
 *
 * // Cleanup on shutdown
 * await client.close();
 * ```
 */
export class MandateClient {
  // ============================================
  // Backend Integration (NEW)
  // ============================================

  private backend: MandateBackend;
  private mandateManager: MandateManager;
  private auditBatcher: AuditBatcher;

  // ============================================
  // Core Components (KEPT from Phase 1)
  // ============================================

  private policyEngine: PolicyEngine;
  private stateManager: IStateManager;
  private killSwitch: KillSwitch;

  // ============================================
  // State (MODIFIED)
  // ============================================

  /**
   * Current mandate (fetched from backend).
   * Undefined until initialize() completes.
   */
  private mandate?: Mandate;

  /**
   * Agent identifier.
   */
  private readonly agentId: string;

  /**
   * Context for mandate issuance.
   */
  private readonly context: Record<string, string>;

  /**
   * Private constructor.
   * Use MandateClient.create() instead.
   */
  private constructor(config: MandateClientConfig) {
    this.agentId = config.agentId;
    this.context = config.context;

    // Initialize backend
    this.backend = new MandateBackend({
      apiKey: config.apiKey,
      backendUrl: config.backendUrl,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      agentId: config.agentId,
    });

    // Initialize mandate manager
    this.mandateManager = new MandateManager({
      agentId: config.agentId,
      mandateAPI: this.backend.mandates,
      cacheConfig: config.cacheConfig,
      refreshInterval: config.refreshInterval,
      autoRefresh: config.autoRefresh ?? true,
    });

    // Initialize audit batcher
    this.auditBatcher = new AuditBatcher({
      auditAPI: this.backend.audit,
      batchSize: config.batcherConfig?.batchSize,
      flushInterval: config.batcherConfig?.flushInterval,
      maxBufferSize: config.batcherConfig?.maxBufferSize,
    });

    // Initialize core components (Phase 1 components)
    this.policyEngine = new PolicyEngine();
    this.stateManager = createStateManager(
      config.stateManager as StateManagerConfig | undefined
    );
    this.killSwitch = new KillSwitch(this.stateManager);
  }

  /**
   * Create and initialize MandateClient.
   *
   * This is the recommended way to create a client.
   * Fetches mandate from backend before returning.
   *
   * @param config - Client configuration
   * @returns Initialized MandateClient
   *
   * @example
   * ```typescript
   * const client = await MandateClient.create({
   *   agentId: 'agent-123',
   *   apiKey: 'sk-org-abc-xxx',
   *   backendUrl: 'http://localhost:3000',
   *   context: {
   *     user_tier: 'free',
   *     environment: 'production'
   *   }
   * });
   *
   * // Client is ready to use
   * await client.executeTool(...);
   *
   * // Cleanup on shutdown
   * await client.close();
   * ```
   */
  static async create(config: MandateClientConfig): Promise<MandateClient> {
    const client = new MandateClient(config);
    await client.initialize();
    return client;
  }

  /**
   * Initialize client by fetching mandate from backend.
   *
   * Called automatically by create().
   * Can be called manually if using constructor directly (not recommended).
   */
  private async initialize(): Promise<void> {
    // Fetch mandate from backend (uses cache if available)
    this.mandate = await this.mandateManager.getMandate(this.context);

    console.log(`[Mandate] Initialized with mandate ${this.mandate.id}`);
  }

  /**
   * Execute an action with mandate enforcement.
   *
   * Flow:
   * 1. Check if client is initialized
   * 2. Check kill switch (backend)
   * 3. Execute with policy enforcement
   * 4. Add audit entry to batcher
   *
   * @param action - Action to execute
   * @param executor - Function that performs the action
   * @returns Action result
   *
   * @throws Error if client not initialized
   * @throws Error if agent is killed
   * @throws Error if action violates mandate
   */
  async execute<T>(action: Action, executor: () => Promise<T>): Promise<T> {
    // Guard: Check initialization
    if (!this.mandate) {
      throw new Error(
        "MandateClient not initialized. Use MandateClient.create() or call initialize()"
      );
    }

    // 1. Check kill switch (backend)
    const killed = await this.backend.killSwitch.isKilled(this.agentId);
    if (killed) {
      const error = new Error(`Agent ${this.agentId} has been killed`);

      // Log kill decision
      this.auditBatcher.add({
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        agentId: this.agentId,
        mandateId: this.mandate.id,
        actionId: action.id,
        action: action.type,
        decision: "BLOCK",
        reason: "Agent killed via backend",
        blockCode: "AGENT_KILLED",
      });

      throw error;
    }

    // 2. Execute with policy enforcement (Phase 1 logic)
    const startTime = Date.now();
    let result: T;
    let actualCost: number | undefined;

    try {
      result = await executeWithMandate(
        action,
        executor,
        this.mandate,
        this.policyEngine,
        this.stateManager,
        undefined // No direct audit logger (using batcher)
      );

      // Extract actualCost if available (for LLM calls)
      if (result && typeof result === "object" && "actualCost" in result) {
        actualCost = (result as any).actualCost;
      }

      // Create success audit entry
      const state = await this.stateManager.get(
        this.mandate.agentId,
        this.mandate.id
      );
      const auditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        agentId: this.agentId,
        mandateId: this.mandate.id,
        actionId: action.id,
        action: action.type,
        decision: "ALLOW" as const,
        reason: "All checks passed",
        estimatedCost: action.estimatedCost,
        actualCost,
        cumulativeCost: state.cumulativeCost,
        durationMs: Date.now() - startTime,
      };

      this.auditBatcher.add(auditEntry);
    } catch (error) {
      // Execution failed - create blocked audit entry
      const auditEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        agentId: this.agentId,
        mandateId: this.mandate.id,
        actionId: action.id,
        action: action.type,
        decision: "BLOCK" as const,
        reason: error instanceof Error ? error.message : "Unknown error",
        blockCode: this.extractBlockCode(error) as any,
        estimatedCost: action.estimatedCost,
        durationMs: Date.now() - startTime,
      };

      // Add to batcher before re-throwing
      this.auditBatcher.add(auditEntry);
      throw error;
    }

    return result;
  }

  /**
   * Extract block code from error.
   * Helper for audit logging.
   */
  private extractBlockCode(error: unknown): string | undefined {
    if (error instanceof Error) {
      // Check if error has blockCode property
      if ("blockCode" in error) {
        return (error as any).blockCode;
      }

      // Infer from message
      const message = error.message.toLowerCase();
      if (message.includes("cost") || message.includes("budget")) {
        return "COST_LIMIT_EXCEEDED";
      }
      if (message.includes("rate") || message.includes("limit")) {
        return "RATE_LIMIT_EXCEEDED";
      }
      if (message.includes("tool") || message.includes("denied")) {
        return "TOOL_NOT_ALLOWED";
      }
    }

    return "POLICY_VIOLATION";
  }

  /**
   * Execute a tool with mandate enforcement.
   *
   * Convenience wrapper around execute() for tool calls.
   */
  async executeTool<T>(action: Action, executor: () => Promise<T>): Promise<T> {
    return this.execute(action, executor);
  }

  /**
   * Execute an LLM call with mandate enforcement.
   *
   * Automatically extracts actual cost from response.
   */
  async executeLLM<T>(action: Action, executor: () => Promise<T>): Promise<T> {
    return this.execute(action, executor);
  }

  /**
   * Execute an LLM call with automatic budget-based max_tokens.
   *
   * This is a convenience method that:
   * 1. Estimates input tokens from messages
   * 2. Calculates max output tokens based on remaining budget
   * 3. Creates LLM action
   * 4. Executes with enforcement
   *
   * @param provider - LLM provider
   * @param model - Model name
   * @param messages - Chat messages
   * @param executor - Function that calls the LLM (receives max_tokens)
   * @returns LLM response with actualCost injected
   *
   * @example
   * ```typescript
   * const response = await client.executeLLMWithBudget(
   *   'openai',
   *   'gpt-4o',
   *   messages,
   *   (maxTokens) => openai.chat.completions.create({
   *     model: 'gpt-4o',
   *     messages,
   *     max_tokens: maxTokens
   *   })
   * );
   * ```
   */
  async executeLLMWithBudget<T>(
    provider: string,
    model: string,
    messages: any[],
    executor: (maxTokens: number) => Promise<T>
  ): Promise<T> {
    // Estimate input tokens
    const inputTokens = estimateTokensFromMessages(messages);

    // Guard: Check initialization
    if (!this.mandate) {
      throw new Error(
        "MandateClient not initialized. Use MandateClient.create() or call initialize()"
      );
    }

    // Get pricing (custom pricing from mandate takes precedence)
    const pricing = getPricing(provider, model, this.mandate.customPricing);

    // Calculate max output tokens
    const remainingBudget = (await this.getRemainingBudget()) || Infinity;
    const maxOutputTokens = pricing
      ? calculateMaxOutputTokens(remainingBudget, inputTokens, pricing, 2000)
      : 2000;

    // Warn if no pricing found
    if (!pricing) {
      console.warn(
        `[Mandate] No pricing found for ${provider}/${model}. ` +
          `Assuming $0 cost. Add customPricing to Mandate for accurate tracking.`
      );
    }

    // Create action
    const action = createLLMAction(
      this.mandate.agentId,
      provider,
      model,
      inputTokens,
      maxOutputTokens,
      this.mandate.customPricing // Pass custom pricing
    );

    // Execute with max_tokens passed to executor
    return this.executeLLM(action, () => executor(maxOutputTokens));
  }

  /**
   * Kill agent via backend.
   *
   * This sends kill signal to backend, which:
   * - Marks agent as killed in database
   * - Broadcasts kill signal via Redis pub/sub (if enabled)
   * - Immediately blocks all actions on all instances
   *
   * @param reason - Reason for kill (required for audit)
   */
  async kill(reason?: string): Promise<void> {
    await this.backend.killSwitch.kill(
      this.agentId,
      reason || "Manual kill via SDK"
    );

    console.log(`[Mandate] Killed agent ${this.agentId}: ${reason}`);
  }

  /**
   * Check if agent is killed.
   *
   * Checks backend kill switch status.
   */
  async isKilled(): Promise<boolean> {
    return await this.backend.killSwitch.isKilled(this.agentId);
  }

  /**
   * Register kill callback.
   *
   * @param callback - Called when agent is killed (local or remote)
   */
  onKill(callback: (reason: string) => void): void {
    // Guard: Check initialization
    if (!this.mandate) {
      throw new Error(
        "MandateClient not initialized. Use MandateClient.create() or call initialize()"
      );
    }

    if (this.stateManager.onKill) {
      this.stateManager.onKill(this.mandate.agentId, callback);
    }
  }

  /**
   * Resurrect the agent (for testing/recovery).
   */
  resurrect(): void {
    // Guard: Check initialization
    if (!this.mandate) {
      throw new Error(
        "MandateClient not initialized. Use MandateClient.create() or call initialize()"
      );
    }

    this.killSwitch.resurrect(this.mandate.agentId, this.mandate.id);
  }

  /**
   * Get current cumulative cost.
   */
  async getCost(): Promise<{
    total: number;
    cognition: number;
    execution: number;
  }> {
    // Guard: Check initialization
    if (!this.mandate) {
      throw new Error(
        "MandateClient not initialized. Use MandateClient.create() or call initialize()"
      );
    }

    const state = await this.stateManager.get(
      this.mandate.agentId,
      this.mandate.id
    );
    return {
      total: state.cumulativeCost,
      cognition: state.cognitionCost,
      execution: state.executionCost,
    };
  }

  /**
   * Get current cost spent.
   */
  async getCurrentCost(): Promise<number> {
    // Guard: Check initialization
    if (!this.mandate) {
      throw new Error(
        "MandateClient not initialized. Use MandateClient.create() or call initialize()"
      );
    }

    const state = await this.stateManager.get(
      this.mandate.agentId,
      this.mandate.id
    );
    return state.cumulativeCost;
  }

  /**
   * Get remaining budget.
   *
   * Returns undefined if:
   * - Client not initialized
   * - No budget limit set
   */
  async getRemainingBudget(): Promise<number | undefined> {
    // Guard: Check initialization
    if (!this.mandate) {
      return undefined;
    }

    const state = await this.stateManager.get(
      this.mandate.agentId,
      this.mandate.id
    );

    if (!this.mandate.maxCostTotal) {
      return undefined;
    }

    return this.mandate.maxCostTotal - state.cumulativeCost;
  }

  /**
   * Get total call count.
   */
  async getCallCount(): Promise<number> {
    // Guard: Check initialization
    if (!this.mandate) {
      throw new Error(
        "MandateClient not initialized. Use MandateClient.create() or call initialize()"
      );
    }

    const state = await this.stateManager.get(
      this.mandate.agentId,
      this.mandate.id
    );
    return state.callCount;
  }

  /**
   * Get audit entries.
   * @deprecated Audit entries are now synced to backend via AuditBatcher.
   * Use backend.audit.query() to retrieve audit logs.
   */
  getAuditEntries() {
    throw new Error(
      "Audit entries are now synced to backend. Use backend.audit.query() to retrieve audit logs."
    );
  }

  /**
   * Get current mandate.
   *
   * May be undefined if client not initialized.
   */
  getMandate(): Mandate | undefined {
    return this.mandate;
  }

  /**
   * Gracefully shutdown client.
   *
   * Call this before application shutdown to:
   * - Stop mandate auto-refresh
   * - Flush buffered audit logs
   * - Stop audit batcher timer
   *
   * @example
   * ```typescript
   * // On application shutdown
   * await client.close();
   * ```
   */
  async close(): Promise<void> {
    console.log("[Mandate] Shutting down client...");

    // 1. Stop mandate auto-refresh
    this.mandateManager.stopAutoRefresh();
    console.log("[Mandate] Stopped mandate auto-refresh");

    // 2. Flush buffered audit logs
    try {
      const flushed = await this.auditBatcher.flush();
      console.log(`[Mandate] Flushed ${flushed} audit logs`);
    } catch (error) {
      console.error("[Mandate] Failed to flush audit logs on shutdown:", error);
    }

    // 3. Stop batcher timer
    this.auditBatcher.stop();
    console.log("[Mandate] Stopped audit batcher");

    // 4. Close state manager
    await this.stateManager.close();

    console.log("[Mandate] Client shutdown complete");
  }

  /**
   * Refresh mandate from backend.
   *
   * Forces immediate refresh (bypasses cache).
   * Updates internal mandate reference.
   */
  async refreshMandate(): Promise<void> {
    const success = await this.mandateManager.refresh(this.context);
    if (success) {
      this.mandate = await this.mandateManager.getMandate(this.context);
      console.log(`[Mandate] Refreshed to mandate ${this.mandate?.id}`);
    } else {
      console.warn("[Mandate] Failed to refresh mandate");
    }
  }

  /**
   * Get mandate cache statistics.
   *
   * Useful for monitoring cache health.
   */
  getCacheStats() {
    return this.mandateManager.getCacheStats();
  }

  /**
   * Get audit batcher statistics.
   *
   * Useful for monitoring audit sync health.
   */
  getAuditStats() {
    return this.auditBatcher.getStats();
  }

  /**
   * Access internal components (for advanced users).
   */
  get internals() {
    return {
      policyEngine: this.policyEngine,
      stateManager: this.stateManager,
      killSwitch: this.killSwitch,
      backend: this.backend,
      mandateManager: this.mandateManager,
      auditBatcher: this.auditBatcher,
      mandate: this.mandate,
    };
  }
}

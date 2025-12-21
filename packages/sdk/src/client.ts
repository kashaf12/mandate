import { PolicyEngine } from "./policy";
import { StateManager } from "./state";
import { KillSwitch } from "./killswitch";
import {
  ConsoleAuditLogger,
  MemoryAuditLogger,
  FileAuditLogger,
  NoOpAuditLogger,
  type AuditLogger,
} from "./audit";
import { executeWithMandate } from "./executor";
import {
  executeLLM as helperExecuteLLM,
  executeTool as helperExecuteTool,
} from "./helpers";
import type { Mandate, Action } from "./types";

/**
 * Audit logger configuration.
 */
export type AuditLoggerConfig =
  | "console" // Log to console
  | "memory" // Store in memory (testing)
  | "none" // No logging
  | { file: string } // Log to file
  | AuditLogger; // Custom logger

/**
 * MandateClient configuration.
 */
export interface MandateClientConfig {
  mandate: Mandate;
  auditLogger?: AuditLoggerConfig;
}

/**
 * High-level client for Mandate SDK.
 *
 * Encapsulates PolicyEngine, StateManager, KillSwitch, and AuditLogger
 * to provide a simple, developer-friendly API.
 *
 * @example
 * ```typescript
 * // Simple setup
 * const client = new MandateClient({
 *   mandate: {
 *     version: 1,
 *     id: 'mandate-1',
 *     agentId: 'agent-1',
 *     issuedAt: Date.now(),
 *     maxCostTotal: 10.0,
 *     allowedTools: ['*']
 *   }
 * });
 *
 * // Execute actions
 * const action = createToolAction('agent-1', 'send_email', { to: 'user@example.com' });
 * const result = await client.executeTool(action, () => sendEmail());
 *
 * // Check state
 * console.log('Cost:', client.getCost());
 * console.log('Calls:', client.getCallCount());
 *
 * // Emergency stop
 * client.kill('Detected loop');
 * ```
 */
export class MandateClient {
  private policyEngine: PolicyEngine;
  private stateManager: StateManager;
  private killSwitch: KillSwitch;
  private auditLogger: AuditLogger | undefined;
  private mandate: Mandate;

  constructor(config: MandateClientConfig) {
    this.mandate = config.mandate;
    this.policyEngine = new PolicyEngine();
    this.stateManager = new StateManager();
    this.killSwitch = new KillSwitch(this.stateManager);
    this.auditLogger = this.createAuditLogger(config.auditLogger);
  }

  /**
   * Execute an action with mandate enforcement.
   *
   * This is the low-level execution primitive.
   */
  async execute<T>(action: Action, executor: () => Promise<T>): Promise<T> {
    return executeWithMandate(
      action,
      executor,
      this.mandate,
      this.policyEngine,
      this.stateManager,
      this.auditLogger
    );
  }

  /**
   * Execute a tool with mandate enforcement.
   *
   * Convenience wrapper around execute() for tool calls.
   */
  async executeTool<T>(action: Action, executor: () => Promise<T>): Promise<T> {
    return helperExecuteTool(
      action,
      executor,
      this.mandate,
      this.policyEngine,
      this.stateManager,
      this.auditLogger
    );
  }

  /**
   * Execute an LLM call with mandate enforcement.
   *
   * Automatically extracts actual cost from response.
   */
  async executeLLM<T>(action: Action, executor: () => Promise<T>): Promise<T> {
    return helperExecuteLLM(
      action,
      executor,
      this.mandate,
      this.policyEngine,
      this.stateManager,
      this.auditLogger
    );
  }

  /**
   * Kill this agent.
   */
  kill(reason?: string): void {
    this.killSwitch.kill(this.mandate.agentId, this.mandate.id, reason);
  }

  /**
   * Check if agent is killed.
   */
  isKilled(): boolean {
    return this.killSwitch.isKilled(this.mandate.agentId, this.mandate.id);
  }

  /**
   * Resurrect the agent (for testing/recovery).
   */
  resurrect(): void {
    this.killSwitch.resurrect(this.mandate.agentId, this.mandate.id);
  }

  /**
   * Get current cumulative cost.
   */
  getCost(): { total: number; cognition: number; execution: number } {
    const state = this.stateManager.get(this.mandate.agentId, this.mandate.id);
    return {
      total: state.cumulativeCost,
      cognition: state.cognitionCost,
      execution: state.executionCost,
    };
  }

  /**
   * Get remaining budget.
   */
  getRemainingBudget(): number | undefined {
    if (!this.mandate.maxCostTotal) return undefined;
    const state = this.stateManager.get(this.mandate.agentId, this.mandate.id);
    return this.mandate.maxCostTotal - state.cumulativeCost;
  }

  /**
   * Get total call count.
   */
  getCallCount(): number {
    const state = this.stateManager.get(this.mandate.agentId, this.mandate.id);
    return state.callCount;
  }

  /**
   * Get audit entries (only works with MemoryAuditLogger).
   */
  getAuditEntries() {
    if (this.auditLogger instanceof MemoryAuditLogger) {
      return this.auditLogger.getEntries();
    }
    throw new Error("Audit entries only available with MemoryAuditLogger");
  }

  /**
   * Get the mandate.
   */
  getMandate(): Mandate {
    return this.mandate;
  }

  /**
   * Access internal components (for advanced users).
   */
  get internals() {
    return {
      policyEngine: this.policyEngine,
      stateManager: this.stateManager,
      killSwitch: this.killSwitch,
      auditLogger: this.auditLogger,
    };
  }

  /**
   * Create audit logger from config.
   */
  private createAuditLogger(
    config?: AuditLoggerConfig
  ): AuditLogger | undefined {
    if (!config) return undefined;

    if (typeof config === "string") {
      switch (config) {
        case "console":
          return new ConsoleAuditLogger();
        case "memory":
          return new MemoryAuditLogger();
        case "none":
          return new NoOpAuditLogger();
        default:
          throw new Error(`Unknown audit logger: ${config}`);
      }
    }

    if (typeof config === "object") {
      if ("file" in config) {
        return new FileAuditLogger(config.file);
      }
      // Custom logger
      return config;
    }

    return undefined;
  }
}

// Types
export type {
  Mandate,
  ToolPolicy,
  RateLimit,
  VerificationDecision,
  ResultVerifier,
  CostType,
  ChargingPolicy,
  Action,
  ToolCall,
  LLMCall,
  BlockCode,
  Decision,
  AgentState,
  AuditEntry,
  PostExecutionResult,
  ModelPricing,
  ProviderPricing,
  TokenUsage,
} from "./types";

// Identity (Phase 2)
export {
  createAgentIdentity,
  generateAgentId,
  validateAgentIdentity,
  type AgentIdentity,
} from "./identity";

// Registry (Phase 2)
export { MemoryAgentRegistry, type AgentRegistry } from "./registry";

// Mandate Factory (Phase 2)
export {
  createMandate,
  MandateTemplates,
  type MandateOptions,
} from "./mandate-factory";

// Validation (Phase 2)
export {
  validateSchema,
  ValidationPatterns,
  CommonSchemas,
  type ValidationContext,
  type ValidationResult,
  type ArgumentValidation,
} from "./validation";

// Re-export Zod for user convenience
export { z } from "zod";

// Charging
export type { ChargingContext } from "./charging";
export { evaluateChargingPolicy } from "./charging";

// Pricing
export {
  calculateCost,
  estimateCost,
  getPricing,
  estimateTokens,
  DEFAULT_PRICING,
} from "./pricing";

// Classes
export { MandateBlockedError } from "./types";
export { PolicyEngine } from "./policy";
export { StateManager, MemoryStateManager, RedisStateManager } from "./state";
export type { IStateManager, StateManagerConfig, RedisConfig } from "./state";

// Core Primitive
export { executeWithMandate } from "./executor";

// Helpers (Layer 5)
export {
  createLLMAction,
  createToolAction,
  executeLLM,
  executeTool,
  estimateTokensFromMessages,
  calculateMaxOutputTokens,
} from "./helpers";

// Utilities
export { matchesPattern, isToolAllowed } from "./patterns";

// Audit Loggers
export type { AuditLogger } from "./audit";
export {
  ConsoleAuditLogger,
  MemoryAuditLogger,
  FileAuditLogger,
  NoOpAuditLogger,
  MultiAuditLogger,
} from "./audit";

// Kill Switch
export { KillSwitch } from "./killswitch";

// High-level Client (recommended for most users)
export { MandateClient } from "./client";
export type { MandateClientConfig, AuditLoggerConfig } from "./client";

// State Manager Factory
export {
  createStateManager,
  createDistributedStateManager,
} from "./state/factory";

// Backend Client (Phase 3)
export { BackendClient } from "./backend/client";
export type { BackendClientConfig } from "./backend/types";
export {
  BackendError,
  BackendUnavailableError,
  BackendClientError,
  BackendServerError,
  BackendTimeoutError,
} from "./backend/errors";

// Backend Mandate API (Phase 3)
export { MandateAPI } from "./backend/mandate-api";
export type {
  BackendMandateResponse,
  BackendMandateDetail,
  IssueMandateRequest,
} from "./backend/mandate-types";

// Backend Audit API (Phase 3)
export { AuditAPI } from "./backend/audit-api";
export type {
  BulkCreateAuditLogsRequest,
  BulkCreateAuditLogsResponse,
  BackendAuditLog,
  QueryAuditLogsRequest,
  BackendAuditLogResponse,
} from "./backend/audit-types";

// Backend Kill Switch API (Phase 3)
export { KillSwitchAPI } from "./backend/killswitch-api";
export type {
  KillStatusResponse,
  KillAgentRequest,
  KillAgentResponse,
} from "./backend/killswitch-types";

// Unified Backend API (Phase 3) - Primary export for backend operations
export { MandateBackend } from "./backend/backend";
export type {
  MandateBackendConfig,
  HealthCheckResponse,
} from "./backend/backend";

// Backend Mandate Cache (Phase 3)
export { MandateCache } from "./backend/mandate-cache";
export type { MandateCacheConfig } from "./backend/mandate-cache";

// Backend Mandate Manager (Phase 3)
export { MandateManager } from "./backend/mandate-manager";
export type { MandateManagerConfig } from "./backend/mandate-manager";

// Backend Audit Batcher (Phase 3)
export { AuditBatcher } from "./backend/audit-batcher";
export type { AuditBatcherConfig, BatcherStats } from "./backend/audit-batcher";

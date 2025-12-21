// ============================================================================
// MANDATE - The authority envelope
// ============================================================================

export interface Mandate {
  version: number;

  // Identity
  id: string;
  agentId: string;
  principal?: string;
  issuer?: {
    type: "human" | "service" | "system";
    id: string;
  };

  // Temporal bounds
  issuedAt: number;
  expiresAt?: number;

  // Scope
  scope?: {
    environment?: "dev" | "staging" | "prod";
    service?: string;
    region?: string;
  };

  // Cost limits
  maxCostPerCall?: number;
  maxCostTotal?: number;

  // Tool permissions
  allowedTools?: string[];
  deniedTools?: string[];

  // Tool-specific policies
  toolPolicies?: Record<string, ToolPolicy>;

  // Rate limits
  rateLimit?: RateLimit;

  // Default charging policy (if tool doesn't specify one)
  defaultChargingPolicy?: ChargingPolicy;

  // Custom pricing (optional)
  customPricing?: ProviderPricing;
}

export interface ToolPolicy {
  maxCostPerCall?: number;
  rateLimit?: RateLimit;
  verifyResult?: ResultVerifier;
}

// ============================================================================
// CHARGING POLICIES - How to handle cost for different outcomes
// ============================================================================

export type ChargingPolicy =
  | {
      type: "ATTEMPT_BASED";
      // Charge on execution, regardless of outcome
      // Use for: AWS Lambda, external APIs, anything that costs money to run
    }
  | {
      type: "SUCCESS_BASED";
      // Only charge if execution succeeds AND verification passes
      // Use for: Tools where failed attempts should be free
    }
  | {
      type: "TIERED";
      // Different charges for different outcomes
      attemptCost: number; // Charged when execution starts
      successCost: number; // Additional charge if succeeds
      verificationCost?: number; // Additional charge if verification passes
    }
  | {
      type: "CUSTOM";
      // User-defined charging logic
      compute: (ctx: {
        action: Action;
        executed: boolean; // Did execution complete?
        executionSuccess: boolean; // Did execution succeed (no throw)?
        verificationSuccess: boolean; // Did verification pass?
        estimatedCost?: number;
        actualCost?: number;
      }) => number; // Returns actual cost to charge
    };

export interface ToolPolicy {
  maxCostPerCall?: number;
  rateLimit?: RateLimit;
  verifyResult?: ResultVerifier;
  chargingPolicy?: ChargingPolicy; // ← NEW
}

export interface RateLimit {
  maxCalls: number;
  windowMs: number;
}

// ============================================================================
// COST ESTIMATION - Dynamic pricing for LLM providers
// ============================================================================

export interface ModelPricing {
  inputTokenPrice: number; // Price per 1M input tokens
  outputTokenPrice: number; // Price per 1M output tokens
}

export interface ProviderPricing {
  [provider: string]: {
    [modelName: string]: ModelPricing;
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ============================================================================
// VERIFICATION - Post-execution result checking
// ============================================================================

export type VerificationDecision = { ok: true } | { ok: false; reason: string };

export type ResultVerifier = (ctx: {
  action: Action;
  result: unknown;
  mandate: Mandate;
}) => VerificationDecision;

// ============================================================================
// ACTIONS - What agents try to do
// ============================================================================

export type CostType = "COGNITION" | "EXECUTION";

export interface BaseAction {
  // Identity
  id: string; // Unique per logical intent (generated outside agent)
  agentId: string;

  // Replay & retry semantics
  idempotencyKey?: string; // Stable across retries (MUST reuse for retries)
  nonce?: string; // Logical attempt ID

  // Temporal
  timestamp: number;

  // Cost tracking
  estimatedCost?: number;
  costType?: CostType;

  // Tracing
  traceId?: string;
  parentActionId?: string;
}

export interface ToolCall extends BaseAction {
  type: "tool_call";
  tool: string;
  args?: Record<string, unknown>;
  costType?: "EXECUTION";
}

export interface LLMCall extends BaseAction {
  type: "llm_call";
  provider: "openai" | "anthropic" | "ollama" | "other";
  model: string;
  messages?: unknown[]; // Not any[] - preserves type safety
  inputTokens?: number;
  costType?: "COGNITION";
  providerMeta?: Record<string, unknown>; // Additional provider metadata
}

export type Action = ToolCall | LLMCall;

// ============================================================================
// POST-EXECUTION SETTLEMENT
// ============================================================================

export interface PostExecutionResult {
  actionId: string;
  success: boolean;
  actualCost?: number;
  error?: {
    type: "PROVIDER" | "TOOL" | "TIMEOUT" | "UNKNOWN";
    message?: string;
  };
}

/**
 * INVARIANTS (Post-Execution Accounting):
 *
 * - Estimated cost is PROVISIONAL (used for pre-authorization)
 * - Actual cost is AUTHORITATIVE (reconciled after execution)
 * - Failed executions MUST rollback provisional cost
 * - If actualCost > estimatedCost → enforce retroactively or block next action
 * - Overruns must be reconciled immediately
 */

// ============================================================================
// DECISIONS - The enforcement outcome
// ============================================================================

export type BlockCode =
  | "TOOL_NOT_ALLOWED"
  | "TOOL_DENIED"
  | "COST_LIMIT_EXCEEDED"
  | "RATE_LIMIT_EXCEEDED"
  | "MANDATE_EXPIRED"
  | "AGENT_KILLED"
  | "UNKNOWN_TOOL"
  | "DUPLICATE_ACTION"
  | "VERIFICATION_FAILED";

export type Decision =
  | {
      type: "ALLOW";
      reason: string;
      remainingCost?: number;
      remainingCalls?: number;
    }
  | {
      type: "BLOCK";
      reason: string;
      code: BlockCode;
      retryAfterMs?: number;
      /**
       * hard = true  → TERMINAL (never retry: permission denied, mandate expired, agent killed)
       * hard = false → RETRYABLE (retry later: rate limit exceeded, transient failure)
       */
      hard: boolean;
    }
  | {
      type: "DEFER";
      reason: string;
      retryAfterMs?: number;
      /**
       * Reserved for future use:
       * - Async verification
       * - Human approval workflows
       * - Distributed coordination
       */
    };

// ============================================================================
// STATE - Mutable per-agent tracking
// ============================================================================

export interface AgentState {
  agentId: string;
  mandateId: string;

  // Cost tracking (by type)
  cumulativeCost: number;
  cognitionCost: number; // LLM calls only
  executionCost: number; // Tool calls only

  // Rate limiting (agent-level)
  callCount: number;
  windowStart: number;

  // Tool-specific rate limiting
  toolCallCounts: Record<string, { count: number; windowStart: number }>;

  // Replay protection
  seenActionIds: Set<string>;
  seenIdempotencyKeys: Set<string>;

  // Status
  killed: boolean;
  killedAt?: number;
  killedReason?: string;
}

/**
 * INVARIANTS (Replay Protection):
 *
 * - action.id is generated OUTSIDE the agent
 * - Retries MUST reuse idempotencyKey
 * - New intents MUST use a new id
 * - seenActionIds prevents duplicate execution
 * - seenIdempotencyKeys prevents double-charging on retries
 */

// ============================================================================
// AUDIT - Decision records
// ============================================================================

export interface AuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  mandateId: string;

  // Action correlation
  actionId: string;
  idempotencyKey?: string;
  traceId?: string;
  parentActionId?: string;

  // Action details
  action: "tool_call" | "llm_call";
  tool?: string;
  provider?: string;
  model?: string;
  costType?: CostType;

  // Decision outcome
  decision: "ALLOW" | "BLOCK" | "DEFER";
  reason: string;
  blockCode?: BlockCode;

  // Cost tracking
  estimatedCost?: number;
  actualCost?: number;
  cumulativeCost?: number;

  // Audit integrity (tamper-evident logs - future KYA)
  hash?: string;
  previousHash?: string;

  metadata?: Record<string, unknown>;
}

// ============================================================================
// ERRORS
// ============================================================================

export class MandateBlockedError extends Error {
  constructor(
    public readonly code: BlockCode,
    public readonly reason: string,
    public readonly agentId: string,
    public readonly action: Action,
    public readonly decision: Extract<Decision, { type: "BLOCK" }>
  ) {
    super(`Mandate blocked: ${reason}`);
    this.name = "MandateBlockedError";

    // Node.js-specific: captureStackTrace improves stack traces
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, MandateBlockedError);
    }
  }
}

// ============================================================================
// COST RESOLUTION RULES
// ============================================================================

/**
 * Effective cost limit resolution (most restrictive wins):
 *
 * 1. Tool-specific maxCostPerCall (if exists)
 * 2. Agent-level maxCostPerCall (if exists)
 * 3. Remaining mandate capacity (maxCostTotal - cumulativeCost)
 *
 * Enforcement: min(tool limit, agent limit, remaining capacity)
 */

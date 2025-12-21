# Authority Model v1

This document defines the canonical authority primitives for Mandate.

All enforcement logic derives from these types.

---

## Core Types

### Mandate

The authority envelope. Defines what an agent is allowed to do.

```typescript
interface Mandate {
  // Version
  version: number; // Schema version for compatibility

  // Identity
  id: string; // Unique mandate ID
  agentId: string; // Agent this mandate applies to
  principal?: string; // Human/org responsible (optional in v0)

  // Temporal bounds
  issuedAt: number; // Unix timestamp
  expiresAt?: number; // Optional expiration

  // Cost limits
  maxCostPerCall?: number; // Max cost for single call
  maxCostTotal?: number; // Max cumulative cost

  // Tool permissions
  allowedTools?: string[]; // Whitelist (glob patterns)
  deniedTools?: string[]; // Blacklist (glob patterns, takes precedence)

  // Rate limits
  rateLimit?: RateLimit;

  // Scope (optional, for future use)
  scope?: Scope;
}
```

### RateLimit

```typescript
interface RateLimit {
  maxCalls: number; // Max calls allowed
  windowMs: number; // Sliding time window in milliseconds
}
```

**Note:** Phase 1 implements sliding windows only. Calendar-based windows (daily, monthly) are deferred to Phase 3.

### Scope (Future)

```typescript
interface Scope {
  readOnly?: boolean; // Can only read, not write
  allowedResources?: string[]; // Resource patterns allowed
  deniedResources?: string[]; // Resource patterns denied
}
```

---

## Decision Types

### Decision

The outcome of policy evaluation.

```typescript
type Decision =
  | {
      type: "ALLOW";
      reason: string;
      remainingCost?: number; // Budget left after this action
      remainingCalls?: number; // Calls left in rate limit window
    }
  | {
      type: "BLOCK";
      reason: string;
      code: BlockCode;
      retryAfterMs?: number; // When to retry (for rate limits)
      hard: boolean; // true = terminal, false = may retry
    }
  | {
      type: "DEFER"; // Future: human review required
      reason: string;
    };
```

**Decision Metadata:**

- `remainingCost` and `remainingCalls` help agents make intelligent decisions
- `retryAfterMs` enables backoff for rate limits
- `hard` distinguishes terminal blocks (kill switch, mandate expired) from retryable ones (rate limit, budget)

### BlockCode

Why something was blocked.

```typescript
type BlockCode =
  | "TOOL_NOT_ALLOWED" // Tool not in allowlist
  | "TOOL_DENIED" // Tool in denylist
  | "COST_LIMIT_EXCEEDED" // Would exceed cost limit
  | "RATE_LIMIT_EXCEEDED" // Too many calls
  | "MANDATE_EXPIRED" // Mandate no longer valid
  | "AGENT_KILLED" // Kill switch activated
  | "UNKNOWN_TOOL" // Tool not recognized (fail-closed)
  | "DUPLICATE_ACTION" // Action ID already seen (replay protection)
  | "SCOPE_VIOLATION"; // Future: scope restriction
```

---

## Action Types

### ToolCall

A request to execute a tool.

```typescript
interface ToolCall {
  id: string; // Unique call ID (for idempotency)
  agentId: string; // Agent making the call
  tool: string; // Tool name
  args?: Record<string, unknown>; // Tool arguments
  estimatedCost?: number; // Predicted cost (if known)
  timestamp: number; // When the call was made
}
```

### LLMCall

A request to call an LLM.

```typescript
interface LLMCall {
  id: string; // Unique call ID (for idempotency)
  agentId: string; // Agent making the call
  provider: "openai" | "anthropic" | "other";
  model: string;
  inputTokens?: number;
  estimatedCost?: number;
  timestamp: number;
}
```

---

## Audit Types

### AuditEntry

Every decision produces an audit entry.

```typescript
interface AuditEntry {
  id: string; // Unique entry ID
  timestamp: number; // Unix timestamp
  agentId: string;
  mandateId: string;

  // Correlation
  actionId: string; // ID of the action being evaluated
  traceId?: string; // Distributed trace ID
  parentActionId?: string; // ID of parent action (for delegation)

  // What was requested
  action: "tool_call" | "llm_call";
  tool?: string;
  provider?: string;
  model?: string;

  // What was decided
  decision: "ALLOW" | "BLOCK" | "DEFER";
  reason: string;
  blockCode?: BlockCode;

  // Cost tracking
  estimatedCost?: number;
  actualCost?: number;
  cumulativeCost?: number;

  // Context
  metadata?: Record<string, unknown>;
}
```

**Correlation IDs:**

- `actionId`: Links decision to the specific action
- `traceId`: Enables distributed tracing across systems
- `parentActionId`: Tracks delegation chains (Phase 4+)

---

## Evaluation Rules

### Precedence

1. **Replay check** (block if action ID already seen)
2. **Kill switch** (instant block)
3. **Mandate expiration** (block)
4. **Denied tools** (block)
5. **Allowed tools** (allow if match)
6. **Unknown tool** (block â€” fail-closed)
7. **Cost limit** (block if exceeded)
8. **Rate limit** (block if exceeded)

### Pattern Matching

Tool patterns use glob syntax:

- `*` matches any characters
- `read_*` matches `read_file`, `read_db`, etc.
- `*_dangerous` matches `exec_dangerous`, etc.

Denied patterns take precedence over allowed patterns.

### Cost Calculation

```typescript
function shouldBlockForCost(
  call: ToolCall | LLMCall,
  mandate: Mandate,
  state: AgentState
): boolean {
  const estimated = call.estimatedCost ?? 0;
  const cumulative = state.cumulativeCost + estimated;

  if (mandate.maxCostPerCall && estimated > mandate.maxCostPerCall) {
    return true;
  }

  if (mandate.maxCostTotal && cumulative > mandate.maxCostTotal) {
    return true;
  }

  return false;
}
```

### Rate Limit Calculation

```typescript
function shouldBlockForRateLimit(
  call: ToolCall | LLMCall,
  mandate: Mandate,
  state: AgentState
): boolean {
  if (!mandate.rateLimit) return false;

  const now = call.timestamp;
  const windowStart = state.windowStart;
  const windowEnd = windowStart + mandate.rateLimit.windowMs;

  // Window expired, reset
  if (now >= windowEnd) {
    return false; // Will be reset in state update
  }

  // Check if we've hit the limit
  return state.callCount >= mandate.rateLimit.maxCalls;
}
```

---

## State

### AgentState

Mutable state tracked per agent.

```typescript
interface AgentState {
  agentId: string;
  mandateId: string;

  // Cost tracking
  cumulativeCost: number;

  // Rate limiting
  callCount: number;
  windowStart: number; // Start of current rate limit window

  // Replay protection
  seenActionIds: Set<string>; // Actions already executed

  // Status
  killed: boolean;
  killedAt?: number;
  killedReason?: string;
}
```

**Replay Protection:**

The `seenActionIds` set prevents duplicate execution of the same action ID. This is critical for:

- Retry loops
- Crash recovery
- Distributed execution
- Authority double-spend prevention

Once an action is executed, its ID is added to the set. Subsequent attempts with the same ID are blocked with `DUPLICATE_ACTION`.

---

## Mandate Lifecycle (Phase 1)

In Phase 1, a **Mandate is a declarative authority envelope** supplied to the SDK at runtime.

Although Mandates have stable identifiers, principals, and issuance timestamps, the SDK does **not** yet provide persistence, lookup, or revocation APIs.

A Mandate should be treated as:

- **Logically immutable** â€” Once created, don't modify it
- **Semantically an entity** â€” Has identity, provenance, and audit trail
- **Operationally a configuration object** â€” Passed directly to the wrapper

### Revocation in Phase 1

Revocation is achieved by **restarting or redeploying** the agent with a new Mandate.

The SDK provides a `kill()` API for emergency termination, but this does not revoke the Mandate itself â€” it marks the agent as killed in runtime state.

### Future Phases

Centralized issuance, revocation, and distribution are introduced in Phase 3+:

- Mandate registry
- Distributed state coordination
- Authority delegation
- Cryptographic verification

---

## Design Principles

1. **Immutable mandates** â€” Once issued, a mandate doesn't change. Revoke and reissue instead.

2. **Explicit over implicit** â€” If something isn't in the mandate, it's not allowed.

3. **Fail-closed** â€” Unknown = denied. Always.

4. **Deterministic** â€” Same mandate + same state + same action = same decision. Always.

5. **Auditable** â€” Every decision is logged with full context.

6. **Versionable** â€” Mandates include a schema version for backward/forward compatibility.

7. **Correlation** â€” Every action is traceable through audit entries.

---

## Future Extensions (Phase 3+)

### Deferred to Phase 3

- Tiered/dynamic cost models
- Calendar-based rate limiting (daily, monthly)
- Complex multi-tenant rate limiting
- `delegation` field for authority inheritance
- `signature` for cryptographic verification
- `parent` for mandate chains

### Explicitly Out of Scope

- Prompt-based safety (out of scope entirely)
- Content moderation (different problem domain)
- Agent-to-agent payments (Phase 4+)

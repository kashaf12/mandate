# Architecture: Mandate SDK

## Overview

Mandate SDK is a middleware layer that intercepts agent actions and enforces authority at runtime.

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Agent                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Mandate SDK                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Intercept  │─▶│   Evaluate  │─▶│  ALLOW / BLOCK      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │               │                    │              │
│         ▼               ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Audit Log                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if ALLOW)
┌─────────────────────────────────────────────────────────────┐
│                  LLM Provider / Tool                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Enforcement Boundary: LLM vs Tool

**CRITICAL INVARIANT:** LLM calls are non-side-effecting. All real-world effects must occur via ToolCall.

**Mandate does not introspect or restrict model reasoning — only execution.**

### LLM Calls

- **Nature**: Pure computation, no external state changes
- **Enforced**: Cost limits, rate limits, kill switch
- **NOT enforced**: Tool permissions (no side effects to restrict), argument validation, result verification
- **Rationale**: LLM calls are non-side-effecting; restricting them would be meaningless

### Tool Calls

- **Nature**: Real-world effects (file writes, API calls, state changes)
- **Enforced**: Tool permissions (allowlist/denylist), cost limits, rate limits, argument validation, result verification, execution leases
- **Rationale**: Tool calls have side effects and must be fully governed

This boundary is enforced mechanically by the SDK. The PolicyEngine treats LLM and Tool calls differently based on this distinction.

---

## Components

### 1. Wrapper

Wraps LLM clients and tool executors.

**Responsibilities:**

- Intercept outgoing calls
- Extract action metadata (tool name, estimated cost)
- Pass to Policy Engine
- Execute or block based on decision

**Pattern:**

```typescript
// Wrap an OpenAI client
const wrapped = mandate.wrap(openai, { mandate });

// All calls now go through enforcement
const response = await wrapped.chat.completions.create({...});
```

### 2. Policy Engine

Evaluates actions against mandates.

**Responsibilities:**

- Load mandate for agent
- Check kill switch
- Check expiration
- Check tool permissions
- Check cost limits
- Check rate limits
- Return decision with reason

**Interface:**

```typescript
interface PolicyEngine {
  evaluate(
    action: ToolCall | LLMCall,
    mandate: Mandate,
    state: AgentState
  ): Decision;
}
```

**Behavior:**

- Pure function (no side effects)
- Deterministic
- < 1ms execution time

### 3. State Manager

Tracks mutable per-agent state.

**Responsibilities:**

- Track cumulative cost
- Track call count for rate limiting
- Track kill switch status
- Track replay protection (seen action IDs and idempotency keys)

**Storage Modes:**

**Local Enforcement (MemoryStateManager - Default):**

- In-memory (single process)
- Agent-level enforcement (local to this process)
- No persistence
- Resets on restart

**Distributed Enforcement (RedisStateManager - Available Now):**

- Redis-backed state coordination
- Global per-agent limits (across all processes)
- Atomic operations via Lua scripts
- Distributed kill switch (Redis Pub/Sub)
- State persistence across restarts

**Limitations:**

- Redis enforcement is atomic per-action, not cross-action transactions
- Subject to Redis availability (fail-closed if Redis unavailable)
- Kill switch propagation is eventually consistent (Pub/Sub latency)

### 4. Audit Logger

Records every decision.

**Responsibilities:**

- Format audit entries
- Write to configured output
- Never block execution

**Outputs (v0):**

- stdout (default)
- File
- Custom handler

**Format:**

- JSON lines (one entry per line)
- Structured for parsing

### 5. Kill Switch

Instant agent termination.

**Responsibilities:**

- Mark agent as killed
- Block all subsequent actions
- Record kill event

**Interface:**

```typescript
mandate.kill(agentId: string, reason?: string): void;
mandate.killAll(reason?: string): void;
```

---

## Action Lifecycle

Actions flow through a conceptual lifecycle (not a runtime state machine):

1. **CREATED**: Action generated with unique `id` (generated outside agent)
2. **AUTHORIZED**: PolicyEngine evaluates → ALLOW or BLOCK
3. **EXECUTING**: Executor runs the action (if ALLOW)
4. **VERIFIED**: Result verification runs (if configured)
5. **SETTLED**: State committed (cost charged, counters updated, action ID/idempotency key recorded)
6. **REJECTED**: Blocked during authorization or failed verification

**Retry Semantics:**

- Retries MUST reuse the same `action.id` (replay protection will block if already seen)
- Retries MUST reuse the same `idempotencyKey` (if provided)
- New intent MUST use a new `action.id` and new `idempotencyKey`

**Replay Protection:**

- `seenActionIds` prevents duplicate execution of the same action ID
- `seenIdempotencyKeys` prevents double-charging on retries

---

## Decision Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     Action Received                          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Agent killed?  │
                    └─────────────────┘
                      │ yes        │ no
                      ▼            ▼
                   BLOCK    ┌─────────────────┐
                            │ Mandate expired?│
                            └─────────────────┘
                              │ yes        │ no
                              ▼            ▼
                           BLOCK    ┌─────────────────┐
                                    │ Tool in denylist│
                                    └─────────────────┘
                                      │ yes        │ no
                                      ▼            ▼
                                   BLOCK    ┌─────────────────┐
                                            │Tool in allowlist│
                                            └─────────────────┘
                                              │ no         │ yes
                                              ▼            ▼
                                           BLOCK    ┌─────────────────┐
                                          (unknown) │  Cost exceeded? │
                                                    └─────────────────┘
                                                      │ yes        │ no
                                                      ▼            ▼
                                                   BLOCK    ┌─────────────────┐
                                                            │ Rate exceeded?  │
                                                            └─────────────────┘
                                                              │ yes        │ no
                                                              ▼            ▼
                                                           BLOCK        ALLOW
```

---

## Package Structure

```
mandate/
├── packages/
│   ├── sdk/                    # Core SDK
│   │   ├── src/
│   │   │   ├── index.ts        # Public API
│   │   │   ├── wrapper.ts      # Client wrapper
│   │   │   ├── policy.ts       # Policy engine
│   │   │   ├── state.ts        # State manager
│   │   │   ├── audit.ts        # Audit logger
│   │   │   ├── kill.ts         # Kill switch
│   │   │   └── types.ts        # Type definitions
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── examples/               # Usage examples
│       ├── openai-basic/
│       ├── anthropic-basic/
│       └── langchain/
│
├── package.json                # Workspace root
├── pnpm-workspace.yaml
└── turbo.json                  # Build config
```

---

## Integration Points

### OpenAI

```typescript
import OpenAI from 'openai';
import { mandate } from '@mandate/sdk';

const openai = new OpenAI();
const wrapped = mandate.wrap(openai, {
  agentId: 'my-agent',
  mandate: { maxCostTotal: 10.00, allowedTools: ['*'] }
});

// Use normally — enforcement is automatic
const response = await wrapped.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  tools: [...]
});
```

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { mandate } from "@mandate/sdk";

const anthropic = new Anthropic();
const wrapped = mandate.wrap(anthropic, {
  agentId: "my-agent",
  mandate: { maxCostTotal: 10.0 },
});
```

### Direct Tool Calls

```typescript
import { mandate } from "@mandate/sdk";

const executor = mandate.createExecutor({
  agentId: "my-agent",
  mandate: { allowedTools: ["read_file", "search"] },
});

// Wrap any tool execution
const result = await executor.run("read_file", { path: "/tmp/data.json" });
```

---

## Error Handling

### Blocked Actions

When an action is blocked, the SDK throws a `MandateBlockedError`:

```typescript
class MandateBlockedError extends Error {
  code: BlockCode;
  reason: string;
  agentId: string;
  action: ToolCall | LLMCall;
}
```

Callers can catch and handle:

```typescript
try {
  await wrapped.chat.completions.create({...});
} catch (e) {
  if (e instanceof MandateBlockedError) {
    console.log(`Blocked: ${e.reason}`);
    // Handle gracefully
  }
  throw e;
}
```

### SDK Failures

If the SDK itself fails (bug, misconfiguration):

- **Fail-closed**: Block the action
- **Log the failure**: Include SDK error in audit
- **Don't crash the agent**: Throw catchable error

---

## Performance

### Latency Budget

| Component         | Target        |
| ----------------- | ------------- |
| Wrapper overhead  | < 1ms         |
| Policy evaluation | < 1ms         |
| State lookup      | < 5ms         |
| Audit logging     | < 5ms (async) |
| **Total**         | **< 50ms**    |

### Optimizations

- Policy evaluation is pure — can be memoized
- Audit logging is async — doesn't block execution
- State is in-memory — no network calls in v0
- Patterns are pre-compiled — glob matching is fast

---

## Testing Strategy

### Unit Tests

- Policy engine (deterministic, easy to test)
- Pattern matching
- Cost calculation
- Rate limiting logic

### Integration Tests

- Full wrapper → decision → audit flow
- OpenAI client integration
- Anthropic client integration

### Property Tests

- Decision determinism (same input = same output)
- Fail-closed behavior (unknown = denied)
- Precedence ordering

### Load Tests

- Latency under load
- Memory usage with many agents
- Rate limiting accuracy

## Backend Architecture (Phase 2)

### Components

1. **Agent Service**

   - Registration, retrieval, updates
   - API key generation (SHA-256 hashed)
   - Principal tracking

2. **Policy Service**

   - CRUD operations
   - Versioning (immutable)
   - Validation

3. **Rule Engine**

   - Rule evaluation (context matching)
   - Policy composition (MIN, INTERSECTION, UNION)
   - Priority ordering

4. **Mandate Service**

   - Dynamic issuance (POST /mandates/issue)
   - TTL management (5 minutes)
   - Caching strategy

5. **Audit Service**
   - Bulk ingestion
   - Query interface
   - Storage strategy

### Data Models

**Agents Table:**

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(64) UNIQUE NOT NULL,
  api_key_hash VARCHAR(128) NOT NULL,
  name VARCHAR(255),
  principal VARCHAR(255),
  environment VARCHAR(32),
  status VARCHAR(32) DEFAULT 'active',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Policies Table:**

```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL,
  name VARCHAR(255),
  description TEXT,
  authority JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  UNIQUE(policy_id, version)
);
```

**Rules Table:**

```sql
CREATE TABLE rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL,
  conditions JSONB NOT NULL,
  policy_id VARCHAR(64) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (policy_id) REFERENCES policies(policy_id)
);
```

**Audit Logs Table:**

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(64) NOT NULL,
  action_id VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  tool_name VARCHAR(255),
  decision VARCHAR(16) NOT NULL,
  reason TEXT,
  estimated_cost DECIMAL(10, 6),
  actual_cost DECIMAL(10, 6),
  cumulative_cost DECIMAL(10, 6),
  context JSONB,
  matched_rules JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_agent_time ON audit_logs(agent_id, timestamp DESC);
CREATE INDEX idx_audit_decision ON audit_logs(decision);
```

**Kill Switches Table:**

```sql
CREATE TABLE kill_switches (
  agent_id VARCHAR(64) PRIMARY KEY,
  killed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  killed_by VARCHAR(255)
);
```

### API Endpoints

**Agents:**

- POST /agents
- GET /agents/:id
- PUT /agents/:id
- DELETE /agents/:id
- POST /agents/:id/kill
- GET /agents/:id/kill-status

**Policies:**

- POST /policies
- GET /policies
- GET /policies/:id
- PUT /policies/:id (new version)
- DELETE /policies/:id

**Rules:**

- POST /rules
- GET /rules
- PUT /rules/:id
- DELETE /rules/:id
- PUT /rules/reorder

**Mandates:**

- POST /mandates/issue
  - Input: {agent_id, context}
  - Output: {mandate, ttl, matched_rules}

**Audit:**

- POST /audit (bulk)
- GET /audit (query)

### Rule Evaluation Algorithm

```typescript
function evaluateRules(context: any, rules: Rule[]): Policy[] {
  // 1. Sort by priority
  const sorted = rules.sort((a, b) => a.priority - b.priority);

  // 2. Find matching rules
  const matched = sorted.filter((rule) =>
    matchesConditions(context, rule.conditions)
  );

  // 3. Get policies
  const policies = matched.map((rule) => getPolicy(rule.policy_id));

  return policies;
}

function matchesConditions(context: any, conditions: Condition[]): boolean {
  return conditions.every((cond) => {
    const value = context[cond.field];
    switch (cond.operator) {
      case "==":
        return value === cond.value;
      case "!=":
        return value !== cond.value;
      case "in":
        return cond.value.includes(value);
      case "contains":
        return value?.includes(cond.value);
      default:
        return false;
    }
  });
}
```

### Policy Composition

```typescript
function composePolicies(policies: Policy[]): Policy {
  if (policies.length === 0) {
    throw new Error("No policies matched");
  }

  if (policies.length === 1) {
    return policies[0];
  }

  // Compose multiple policies
  return {
    // Budget: MIN
    maxCostTotal: Math.min(...policies.map((p) => p.maxCostTotal || Infinity)),

    // Rate: MIN
    maxCallsPerTool: Math.min(
      ...policies.map((p) => p.maxCallsPerTool || Infinity)
    ),

    // Tools: INTERSECTION
    allowedTools: intersection(...policies.map((p) => p.allowedTools || [])),

    // Denied: UNION
    deniedTools: union(...policies.map((p) => p.deniedTools || [])),
  };
}
```

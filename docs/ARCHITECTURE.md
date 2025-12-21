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
  evaluate(action: ToolCall | LLMCall, mandate: Mandate, state: AgentState): Decision;
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

**Storage (v0):**
- In-memory (single process)
- No persistence
- Resets on restart

**Future:**
- Redis/external store for distributed state

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
import Anthropic from '@anthropic-ai/sdk';
import { mandate } from '@mandate/sdk';

const anthropic = new Anthropic();
const wrapped = mandate.wrap(anthropic, {
  agentId: 'my-agent',
  mandate: { maxCostTotal: 10.00 }
});
```

### Direct Tool Calls

```typescript
import { mandate } from '@mandate/sdk';

const executor = mandate.createExecutor({
  agentId: 'my-agent',
  mandate: { allowedTools: ['read_file', 'search'] }
});

// Wrap any tool execution
const result = await executor.run('read_file', { path: '/tmp/data.json' });
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

| Component | Target |
|-----------|--------|
| Wrapper overhead | < 1ms |
| Policy evaluation | < 1ms |
| State lookup | < 5ms |
| Audit logging | < 5ms (async) |
| **Total** | **< 50ms** |

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

# Mandate SDK

**Runtime enforcement for AI agent authority.**

Mandate SDK is the first layer of [Know Your Agent (KYA)](./VISION.md) infrastructure — making AI agent authority **mechanically enforceable** at runtime, not just prompt-suggested.

<div align="center">

[![Tests](https://img.shields.io/badge/tests-173%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

[Quick Start](#quick-start) · [Why Mandate?](#why-mandate) · [Examples](#examples) · [Documentation](./packages/sdk/README.md) · [Roadmap](#roadmap)

</div>

---

## The Problem

**AI agents are becoming economic actors** — they spend money, call APIs, and make decisions with real consequences. But they exist as **unbanked ghosts**:

- ❌ Anonymous (no stable identity)
- ❌ Fungible (indistinguishable from each other)
- ❌ Prompt-constrained (authority is a suggestion, not enforcement)
- ❌ Unaccountable (no audit trail)

**Prompts are suggestions. Enforcement is mechanical.**

### A Real Example: The Email That Never Sent

```typescript
// Agent calls email API
const result = await sendEmail({ to: "user@example.com", subject: "Invoice" });

// API returns: { status: 'accepted', messageId: 'msg-123' }
// Agent thinks: "Success! ✅"

// Reality: Email stuck in spam filter, never delivered ❌
```

**Without verification and enforcement:**

- Agent reports success when it failed
- Budget is consumed for failed operations
- No audit trail of what actually happened
- No way to prevent runaway costs

---

## The Solution

**Mandate SDK enforces authority at runtime** through a two-phase execution model:

```typescript
import { MandateClient, createToolAction } from "@mandate/sdk";

// Define what the agent is allowed to do
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-1",
    agentId: "email-agent",
    issuedAt: Date.now(),

    // Limits
    maxCostTotal: 10.0,
    allowedTools: ["send_email"],

    // Verification (proves execution actually worked)
    toolPolicies: {
      send_email: {
        verifyResult: (ctx) => {
          if (!ctx.result.deliveryConfirmed) {
            return { ok: false, reason: "Email not delivered" };
          }
          return { ok: true };
        },
      },
    },
  },
  auditLogger: "console",
});

// Execute with enforcement
const action = createToolAction("email-agent", "send_email", {
  to: "user@example.com",
  subject: "Invoice",
});

try {
  await client.executeTool(action, () => sendEmail());
} catch (error) {
  // Blocked: "Email not delivered"
  // Agent knows it failed
  // Budget not consumed
  // Audit trail created
}
```

**What just happened:**

1. ✅ **Authorization** - Policy checked before execution
2. ✅ **Execution** - Tool called
3. ✅ **Verification** - Result validated against requirements
4. ✅ **Accounting** - Cost only charged if verification passes
5. ✅ **Audit** - Every decision logged with reason

---

## Why Mandate?

### For AI Engineers

**Before Mandate:**

```typescript
// Hope the agent stays within budget
const response = await openai.chat.completions.create({...});
// 🤞 Fingers crossed it doesn't loop
```

**With Mandate:**

```typescript
// Enforce budget mechanically
const response = await client.executeLLMWithBudget(
  "openai",
  "gpt-4o",
  messages,
  (maxTokens) => openai.chat.completions.create({ max_tokens: maxTokens })
);
// 🛡️ Cannot exceed budget (provider enforces max_tokens)
```

### For Product Teams

| Without Mandate                         | With Mandate                    |
| --------------------------------------- | ------------------------------- |
| "Agent went into a loop and spent $500" | Budget enforced: blocked at $10 |
| "Not sure which agent did what"         | Full audit trail with agent IDs |
| "Can't explain why action was blocked"  | Every decision has a reason     |
| "Agent thought it succeeded but failed" | Verification proves success     |

### For Enterprises

**Mandate provides the primitives for:**

- ✅ **Compliance** - Auditable decisions with structured logs
- ✅ **Risk Management** - Hard limits on cost, rate, scope
- ✅ **Accountability** - Every action traced to agent + principal
- ✅ **Governance** - Policy-driven enforcement (not prompt-driven)

---

## Quick Start

### Installation

```bash
npm install @mandate/sdk
# or
pnpm add @mandate/sdk
```

### Simple Example

```typescript
import { MandateClient, createToolAction } from "@mandate/sdk";

// 1. Create client with mandate
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-1",
    agentId: "my-agent",
    issuedAt: Date.now(),
    maxCostTotal: 10.0,
    allowedTools: ["*"], // Allow all tools
  },
});

// 2. Create action
const action = createToolAction("my-agent", "read_file", { path: "/data.txt" });

// 3. Execute with enforcement
const result = await client.executeTool(action, () =>
  fs.readFile("/data.txt", "utf-8")
);

// 4. Check state
console.log("Cost:", client.getCost());
console.log("Remaining:", client.getRemainingBudget());
```

**That's it. Your agent is now enforceable.**

---

## Core Concepts

### Mandate

A **mandate** is an authority envelope that defines what an agent can do:

```typescript
interface Mandate {
  // Identity
  id: string;
  agentId: string;
  principal?: string; // Who is responsible

  // Temporal bounds
  issuedAt: number;
  expiresAt?: number;

  // Limits
  maxCostPerCall?: number;
  maxCostTotal?: number;
  rateLimit?: { maxCalls: number; windowMs: number };

  // Permissions
  allowedTools?: string[]; // Whitelist (supports glob patterns)
  deniedTools?: string[]; // Blacklist (takes precedence)

  // Tool-specific policies
  toolPolicies?: Record<
    string,
    {
      maxCostPerCall?: number;
      rateLimit?: RateLimit;
      chargingPolicy?: ChargingPolicy;
      verifyResult?: (ctx) => VerificationDecision;
    }
  >;
}
```

### Enforcement Flow

```
┌─────────────────┐
│  Agent Action   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Authorization  │ ◄─── PolicyEngine evaluates mandate
│  (pre-flight)   │      - Kill switch?
└────────┬────────┘      - Expired?
         │               - Tool allowed?
         │               - Budget OK?
         ▼               - Rate limit OK?
     ┌───────┐
     │ ALLOW │
     └───┬───┘
         │
         ▼
┌─────────────────┐
│   Execution     │ ◄─── Your function executes
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Verification   │ ◄─── Optional: validate result
│   (optional)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Accounting    │ ◄─── Charging policy determines cost
│ (commit state)  │      - SUCCESS_BASED: only charge on success
└────────┬────────┘      - ATTEMPT_BASED: charge on attempt
         │               - TIERED: different rates
         │               - CUSTOM: your logic
         ▼
┌─────────────────┐
│  Audit Log      │ ◄─── Every decision logged
└─────────────────┘
```

### Charging Policies

**Different tools have different economics:**

```typescript
{
  toolPolicies: {
    // AWS Lambda - charge on attempt (even if fails)
    lambda_invoke: {
      chargingPolicy: { type: 'ATTEMPT_BASED' }
    },

    // SaaS API - only charge on success
    send_email: {
      chargingPolicy: { type: 'SUCCESS_BASED' }
    },

    // Tiered pricing (email service)
    send_email_bulk: {
      chargingPolicy: {
        type: 'TIERED',
        attemptCost: 0.001,      // Charged for trying
        successCost: 0.01,       // Additional if succeeds
        verificationCost: 0.005  // Additional if verified
      }
    },

    // Custom logic
    custom_tool: {
      chargingPolicy: {
        type: 'CUSTOM',
        compute: (ctx) => {
          // Your pricing logic
          return ctx.executionSuccess ? 0.05 : 0.01;
        }
      }
    }
  }
}
```

---

## Examples

### 1. Basic Tool Execution

```typescript
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-basic",
    agentId: "agent-1",
    issuedAt: Date.now(),
    allowedTools: ["read_*", "search"],
  },
});

const action = createToolAction("agent-1", "read_file", { path: "/data.txt" });
const result = await client.executeTool(action, () => readFile("/data.txt"));
```

### 2. LLM with Budget Enforcement

```typescript
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-llm",
    agentId: "agent-1",
    issuedAt: Date.now(),
    maxCostTotal: 5.0, // $5 budget
  },
});

// Automatically calculates max_tokens from remaining budget
const response = await client.executeLLMWithBudget(
  "openai",
  "gpt-4o",
  messages,
  (maxTokens) =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: maxTokens, // Enforced by OpenAI
    })
);
```

### 3. Result Verification

```typescript
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-verify",
    agentId: "agent-1",
    issuedAt: Date.now(),
    toolPolicies: {
      send_email: {
        // Verify email was actually delivered
        verifyResult: (ctx) => {
          const result = ctx.result as EmailResult;

          if (!result.deliveryConfirmed) {
            return {
              ok: false,
              reason: "Email accepted but not delivered",
            };
          }

          return { ok: true };
        },
      },
    },
  },
});

try {
  await client.executeTool(action, () => sendEmail());
} catch (error) {
  // Throws if verification fails
  // State not committed (no charge)
}
```

### 4. Kill Switch

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
});

// Emergency stop
client.kill("Detected infinite loop");

// All subsequent actions blocked
await client.executeTool(action, fn); // Throws: "Agent killed"
```

### 5. Audit Trail

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  auditLogger: "memory", // Store in memory
});

// Execute some actions
await client.executeTool(action1, fn1);
await client.executeTool(action2, fn2);

// Inspect audit trail
const entries = client.getAuditEntries();
entries.forEach((entry) => {
  console.log(`${entry.decision}: ${entry.reason}`);
  console.log(`Cost: $${entry.actualCost}`);
});
```

---

## Architecture

Mandate SDK is built in **8 layers**:

1. **Types + Policy Engine** - Authorization logic (pure functions)
2. **State Management** - Commit-after-success pattern
3. **Two-Phase Executor** - Authorize → Execute → Verify → Commit
4. **Cost Estimation** - Dynamic pricing for LLM providers
5. **Helper Functions** - Clean DX without wrapper complexity
6. **Audit Logging** - Structured decision trail
7. **Kill Switch** - Emergency termination
8. **MandateClient** - High-level facade (recommended API)

**Key Design Principles:**

- ✅ **Fail-closed** - Unknown = denied
- ✅ **Deterministic** - Same input = same output
- ✅ **Explainable** - Every decision has a reason
- ✅ **Type-safe** - Strict TypeScript
- ✅ **Zero dependencies** - Core SDK has no deps
- ✅ **Testable** - 173 passing tests

See [Architecture Guide](./ARCHITECTURE.md) for details.

---

## Roadmap

### Phase 1: Mandate SDK (✅ Current)

**Status: Complete**

- ✅ Runtime enforcement
- ✅ Cost tracking
- ✅ Tool permissions
- ✅ Rate limiting
- ✅ Kill switch
- ✅ Audit logging
- ✅ Charging policies
- ✅ Result verification

**Limitations:**

- In-memory state only (single process)
- No distributed coordination
- No cross-system trust

### Phase 2: Agent Identity (Q1 2025)

**Goal:** Formalize agent identity and ownership

- [ ] Stable agent IDs (persistent across restarts)
- [ ] Principal tracking (who owns the agent)
- [ ] Mandate issuance API
- [ ] Agent registry
- [ ] Identity-based policy evaluation

### Phase 3: Distributed Authority (Q2 2025)

**Goal:** Coordination across multiple processes/servers

- [ ] Redis-backed StateManager
- [ ] Global per-agent limits (not per-server)
- [ ] Distributed kill switch
- [ ] Mandate revocation propagation
- [ ] Eventually-consistent enforcement

### Phase 4: Delegation & Responsibility (Q3 2025)

**Goal:** Agent-to-agent delegation with authority reduction

- [ ] Delegation rules
- [ ] Authority inheritance
- [ ] Responsibility chains
- [ ] Depth limits

### Phase 5: Verifiable Authority (Q4 2025)

**Goal:** Cross-system trust

- [ ] Cryptographically signed mandates
- [ ] Portable authority credentials
- [ ] Agent-to-agent verification
- [ ] Optional: onchain proofs

---

## The Seven Invariants

Mandate is designed to solve [seven discovered problems](./INVARIANTS.md):

1. **Distributed Budget Leakage** - Limits per agent, not per server
2. **Delegation Amplification** - Can't delegate more than you have
3. **Identity Collapse** - Every action → stable agent ID
4. **Replay / Double-Spend** - Authority is consumable
5. **Cross-System Trust** - Authority verifiable outside issuer
6. **Silent Partial Failure** - Enforcement must converge
7. **Override Without Trace** - Overrides are auditable

Each phase solves one or more of these invariants.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Key areas:**

- Additional LLM provider integrations
- More example implementations
- Documentation improvements
- Bug reports and fixes

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Learn More

- 📖 [Full Documentation](./packages/sdk/README.md)
- 🎯 [Vision: Know Your Agent](./VISION.md)
- 🏗️ [Architecture](./ARCHITECTURE.md)
- 📝 [Glossary](./GLOSSARY.md)
- 🚀 [Examples](./packages/examples/README.md)

---

## Community

- **GitHub**: [github.com/mandate/mandate-sdk](https://github.com/mandate/mandate-sdk)
- **Issues**: [Report bugs or request features](https://github.com/mandate/mandate-sdk/issues)
- **Discussions**: [Join the conversation](https://github.com/mandate/mandate-sdk/discussions)

---

<div align="center">

**Built with ❤️ for the AI agent developer community**

_Making agent authority mechanically enforceable_

</div>

---

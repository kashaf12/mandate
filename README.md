# Mandate SDK

**Runtime enforcement for AI agent authority.**

Mandate SDK is the first layer of [Know Your Agent (KYA)](./docs/VISION.md) infrastructure — making AI agent authority **mechanically enforceable** at runtime, not just prompt-suggested.

<div align="center">

[![Tests](https://img.shields.io/badge/tests-173%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

[Quick Start](#quick-start) · [Why Mandate?](#why-mandate) · [Examples](./packages/examples) · [Documentation](./packages/sdk/README.md) · [Roadmap](#roadmap)

</div>

---

## The Problem

**AI agents are becoming economic actors** — they spend money, call APIs, and make decisions with real consequences. But they exist as **unbanked ghosts**:

- ❌ Anonymous (no stable identity)
- ❌ Fungible (indistinguishable from each other)
- ❌ Prompt-constrained (authority is a suggestion, not enforcement)
- ❌ Unaccountable (no audit trail)

**Prompts are suggestions. Enforcement is mechanical.**

### What Goes Wrong

Without mechanical enforcement:

1. **Budget Runaway** - Agent in a loop burns through $500 before you notice
2. **Retry Storms** - Transient error triggers 1000+ retries, each costing money
3. **Tool Abuse** - Agent calls dangerous tools (`delete_*`, `execute_*`) because LLM hallucinated them
4. **No Accountability** - "The agent did it" — but which one? Who owns it? What actually happened?
5. **Silent Failures** - Tool returns success but failed (email accepted, not delivered)

---

## The Solution

**Mandate SDK enforces authority at runtime** through a layered execution model:

```typescript
import { MandateClient, createToolAction } from "@mandate/sdk";

// Define what the agent is allowed to do
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-1",
    agentId: "email-agent",
    issuedAt: Date.now(),

    // Hard limits
    maxCostTotal: 10.0, // $10 total budget
    allowedTools: ["send_email"], // Only this tool

    toolPolicies: {
      send_email: {
        rateLimit: {
          maxCalls: 5, // Max 5 attempts
          windowMs: 60_000, // Per minute
        },
        chargingPolicy: {
          type: "ATTEMPT_BASED", // Charge even on failure
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
  // Blocked if:
  // - Budget exceeded
  // - Rate limit hit
  // - Tool not allowed
  // - Agent killed
}
```

**What just happened:**

1. ✅ **Authorization** - Policy checked before execution
2. ✅ **Execution** - Tool called only if allowed
3. ✅ **Settlement** - Cost reconciled (estimated vs actual)
4. ✅ **Accounting** - Budget updated (commit-after-success)
5. ✅ **Audit** - Decision logged with reason

---

## Why Mandate?

### The Core Insight

> The moment an agent can act in the real world, it must be governable at the **identity level** — not the server level, not the prompt level.

**Enforcement must be:**

- ✅ **Mechanical** - Not AI judgment, not prompt-based
- ✅ **Deterministic** - Same input = same output, always
- ✅ **Explainable** - Every decision has a reason
- ✅ **Fail-closed** - Unknown = denied

### What Mandate Enforces

Mandate enforces **mechanical invariants**, not business outcomes:

| ✅ Good (Mechanical)         | ❌ Bad (Subjective)         |
| ---------------------------- | --------------------------- |
| Agent exceeded budget        | User didn't read the email  |
| Tool called 100x in 1 minute | Email went to spam          |
| Agent called unapproved tool | Customer didn't buy product |
| Budget would be exceeded     | User seemed unhappy         |

**Mandate enforces execution and authority — not business truth.**

### For Different Audiences

**For AI Engineers:**

```typescript
// Before: Hope agent stays in budget
const response = await openai.chat.completions.create({...});
// 🤞 Fingers crossed

// After: Budget mechanically enforced
const response = await client.executeLLMWithBudget(
  'openai', 'gpt-4o', messages,
  (maxTokens) => openai.chat.completions.create({ max_tokens: maxTokens })
);
// 🛡️ Cannot exceed budget (provider enforces max_tokens)
```

**For Product Teams:**

| Without Mandate                          | With Mandate                    |
| ---------------------------------------- | ------------------------------- |
| "Agent went into a loop and spent $500"  | Budget enforced: blocked at $10 |
| "Not sure which agent did what"          | Full audit trail with agent IDs |
| "Can't explain why action was blocked"   | Every decision has a reason     |
| "Agent retried 1000x on transient error" | Rate limit stopped it at 5      |

**For Enterprises:**

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

### 60-Second Example

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
    allowedTools: ["read_*", "search_*"], // Glob patterns supported
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

**See [examples](./packages/examples) for real-world scenarios with LLM agents.**

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
  allowedTools?: string[]; // Whitelist (glob patterns: *, read_*)
  deniedTools?: string[]; // Blacklist (takes precedence)

  // Tool-specific policies
  toolPolicies?: Record<
    string,
    {
      maxCostPerCall?: number;
      rateLimit?: RateLimit;
      chargingPolicy?: ChargingPolicy;
    }
  >;

  // Custom pricing (optional)
  customPricing?: ProviderPricing;
}
```

**Tool patterns support simple glob matching** (`*`, `prefix_*`, `*_suffix`), evaluated deterministically. No regex.

### Enforcement Flow

```
┌─────────────────┐
│  Agent Action   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Authorization  │ ◄─── PolicyEngine (pure function, <1ms)
│  (pre-flight)   │      - Replay check (idempotency)
└────────┬────────┘      - Kill switch?
         │               - Expired?
         │               - Tool allowed?
         ▼               - Budget OK?
     ┌───────┐          - Rate limit OK?
     │ ALLOW │
     └───┬───┘
         │
         ▼
┌─────────────────┐
│   Execution     │ ◄─── Your function executes
└────────┬────────┘      (can fail)
         │
         ▼
┌─────────────────┐
│   Settlement    │ ◄─── Reconcile estimated vs actual cost
│ & Accounting    │      Charging policy determines cost
└────────┬────────┘      - SUCCESS_BASED: only charge on success
         │               - ATTEMPT_BASED: charge on attempt
         │               - TIERED: different rates
         ▼               - CUSTOM: your logic (must be pure)
┌─────────────────┐
│  Commit State   │ ◄─── State only mutates after success
│                 │      (retry-safe, no double-charging)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Audit Log      │ ◄─── Every decision logged
└─────────────────┘      (structured, parseable)
```

**Key phases:**

1. **Authorization** - Pure evaluation (no state mutation)
2. **Execution** - Can fail (network, API errors)
3. **Settlement** - Reconcile actual vs estimated cost
4. **Accounting** - State committed only after success
5. **Audit** - Decision logged with full context

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

    // Tiered pricing
    send_email_bulk: {
      chargingPolicy: {
        type: 'TIERED',
        attemptCost: 0.001,      // Charged for trying
        successCost: 0.01,       // Additional if succeeds
      }
    },

    // Custom logic (must be pure, deterministic, side-effect free)
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

**CRITICAL:** Charging policies must be pure, deterministic, and side-effect free. They are evaluated synchronously during settlement.

### Custom Pricing

**Mandate uses flexible pricing:**

1. **Built-in pricing** - Major providers (OpenAI, Anthropic, Groq)
2. **Custom pricing** - Your models/rates (overrides defaults)
3. **Wildcard pricing** - Provider-wide (`ollama/*` = free)
4. **No pricing = $0** - Free/local models (with warning)

```typescript
{
  customPricing: {
    // Local model with internal cost
    ollama: {
      'llama3.1:8b': {
        inputTokenPrice: 0.01,   // $0.01 per 1M tokens
        outputTokenPrice: 0.02
      }
    },

    // Override default pricing
    openai: {
      'gpt-4o': {
        inputTokenPrice: 2.0,   // Negotiated rate
        outputTokenPrice: 8.0
      }
    },

    // Wildcard for custom provider
    'my-company': {
      '*': {
        inputTokenPrice: 5.0,
        outputTokenPrice: 15.0
      }
    }
  }
}
```

**Mandate computes the budget bound; the provider enforces it** (via `max_tokens`).

---

## Architecture

Mandate SDK is built in **8 layers**:

1. **Types + Policy Engine** - Authorization logic (pure functions)
2. **State Management** - Commit-after-success pattern
3. **Two-Phase Executor** - Authorize → Execute → Settle → Commit
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

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for details.

---

## Phase 1 Limitations (Important)

### Authority Scope

**In Phase 1, Mandate enforces limits per SDK instance, not globally.**

If the same agent runs on multiple processes or servers:

- Budgets are enforced independently
- Costs may multiply across deployments
- Rate limits are per-process

**This is intentional and addressed in Phase 3 (Distributed Authority).**

Example:

```
Agent "email-agent" deployed on 5 servers
Mandate: maxCostTotal = $10

Reality in Phase 1:
- Each server enforces $10 independently
- Agent could spend $50 total (5 × $10)

Phase 3 will add:
- Global per-agent limits
- Distributed state coordination
- Shared accounting
```

### Kill Switch Scope

**The kill switch is local to the MandateClient instance in Phase 1.**

```typescript
client.kill("Detected loop"); // Only affects this client instance
```

Global `killAll()` requires centralized agent registry (Phase 3).

### What Phase 1 Actually Guarantees

Mandate enforces authority **deterministically**, but accounting and settlement are only as accurate as the signals provided by tools and providers. The SDK is fail-closed, not omniscient.

**What this means:**

- ✅ Enforcement is mechanical and correct
- ✅ Policy evaluation is deterministic
- ⚠️ Cost accuracy depends on provider reporting
- ⚠️ Verification depends on tool contracts
- ⚠️ Providers can lie or lag

**Mandate makes the best decision possible with available information.**

---

## Roadmap

### Phase 1: Mandate SDK (✅ Current)

**Status: Complete (December 2024)**

- ✅ Runtime enforcement
- ✅ Cost tracking (LLM + tools)
- ✅ Tool permissions (allowlist/denylist)
- ✅ Rate limiting (agent-level, tool-level)
- ✅ Kill switch
- ✅ Audit logging
- ✅ Charging policies (4 types)
- ✅ Custom pricing
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

## Examples

See [packages/examples](./packages/examples) for complete working examples:

- **Email Agent** - Basic enforcement with verification
- **Retry Storm** - Rate limiting prevents infinite loops (simulated + real LLM)
- **Budget Runaway** - Cost limits prevent overspending
- **Tool Permissions** - Allowlist/denylist enforcement
- **Tool Hallucination** - Real LLM calling dangerous tools (Ollama)
- **Custom Pricing** - 4 pricing scenarios

All examples include:

- ❌ Without Mandate (showing the problem)
- ✅ With Mandate (showing enforcement)
- Real LLM agents (Ollama) where applicable

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

- 📖 [Full SDK Documentation](./packages/sdk/README.md)
- 🎯 [Vision: Know Your Agent](./docs/VISION.md)
- 🏗️ [Architecture Guide](./docs/ARCHITECTURE.md)
- 📚 [Glossary of Terms](./docs/GLOSSARY.md)
- 🚀 [Example Code](./packages/examples)
- 📊 [Authority Model](./docs/AUTHORITY_MODEL.md)

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

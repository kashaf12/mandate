# Mandate SDK Examples

Real-world examples demonstrating Mandate SDK enforcement patterns.

All examples include:

- ❌ **Without Mandate** - Showing the problem
- ✅ **With Mandate** - Showing enforcement
- Real LLM agents (Ollama) where applicable

---

## Table of Contents

- [Setup](#setup)
- [Quick Start](#quick-start)
- [Examples Overview](#examples-overview)
- [Basic Examples](#basic-examples)
- [Real LLM Examples](#real-llm-examples)
- [Advanced Examples](#advanced-examples)
- [Running All Examples](#running-all-examples)

---

## Setup

### Prerequisites

1. **Node.js 18+** and **pnpm**
2. **Ollama** (for LLM examples) - [Download](https://ollama.com)

### Install Dependencies

```bash
cd packages/examples
pnpm install
```

### Pull Ollama Model (for LLM examples)

```bash
ollama pull qwen2.5:3b
```

---

## Quick Start

Run any example:

```bash
pnpm example:email-simple
```

Run all examples:

```bash
pnpm example:all
```

---

## Examples Overview

| Example                                   | Type      | Demonstrates            | LLM Required |
| ----------------------------------------- | --------- | ----------------------- | ------------ |
| [email-baseline](#email-baseline)         | Baseline  | No enforcement          | ❌ No        |
| [email-with-mandate](#email-with-mandate) | Full      | All 7 layers            | ❌ No        |
| [email-simple](#email-simple)             | Simple    | MandateClient API       | ❌ No        |
| [retry-storm](#retry-storm)               | Simulated | Rate limiting           | ❌ No        |
| [retry-storm-llm](#retry-storm-llm)       | Real LLM  | Retry prevention        | ✅ Yes       |
| [budget-runaway](#budget-runaway)         | Simulated | Budget enforcement      | ❌ No        |
| [tool-permissions](#tool-permissions)     | Simulated | Allowlist/denylist      | ❌ No        |
| [tool-hallucination](#tool-hallucination) | Real LLM  | Dangerous tool blocking | ✅ Yes       |
| [custom-pricing](#custom-pricing)         | Demo      | Pricing scenarios       | ❌ No        |

---

## Basic Examples

### email-baseline

**What it shows:** Agent without enforcement (baseline for comparison).

**Run:**

```bash
pnpm example:email-baseline
```

**Key points:**

- No Mandate SDK
- No cost tracking
- No rate limiting
- No verification
- Tool executes unchecked

**Expected output:**

```
[AGENT] Task: Send an email...
[TOOL] send_email called
[TOOL] Result: { status: 'accepted', messageId: 'msg-123' }
[AGENT] Final response: Email sent successfully
```

---

### email-with-mandate

**What it shows:** Full enforcement using all 7 SDK layers.

**Run:**

```bash
pnpm example:email-mandate
```

**Demonstrates:**

- ✅ Layer 1: Policy Engine (authorization)
- ✅ Layer 2: State Manager (state tracking)
- ✅ Layer 3: Two-phase executor (commit-after-success)
- ✅ Layer 4: Cost estimation
- ✅ Layer 5: Helper functions
- ✅ Layer 6: Audit logging (Console + Memory)
- ✅ Layer 7: Kill switch
- ✅ Rate limiting (prevent spam/abuse)
- ✅ Charging policy (ATTEMPT_BASED)

**Expected output:**

```
📧 EMAIL AGENT WITH FULL MANDATE SDK
Budget: $1 total, $0.1 per call
Charging: SUCCESS_BASED

[AGENT] 📤 Calling tool: send_email
[ERROR] 🚫 Verification failed: EMAIL_NOT_CONFIRMED

📊 FINAL STATE
Cumulative cost: $0.01
Agent killed: true

📝 AUDIT TRAIL
[1] BLOCK - Verification failed
```

**Why it blocks:**

- Rate limit exceeded (authority throttle)
- Cost limit exceeded (budget enforcement)
- Tool not allowed (permission enforcement)
- State committed (ATTEMPT_BASED charging)
- Agent killed to prevent retry storm

---

### email-simple

**What it shows:** Clean API using MandateClient.

**Run:**

```bash
pnpm example:email-simple
```

**Demonstrates:**

- ✅ MandateClient facade (simplest API)
- ✅ LLM + tool enforcement
- ✅ Cost tracking
- ✅ Audit trail

**Key code:**

```typescript
const client = new MandateClient({
  mandate: {
    /* ... */
  },
  auditLogger: "console",
});

// LLM call
const response = await client.executeLLMWithBudget(
  "ollama",
  "qwen2.5:3b",
  messages,
  (maxTokens) => openai.chat.completions.create({ max_tokens: maxTokens })
);

// Tool call
const result = await client.executeTool(action, () => sendEmail());
```

**Expected output:**

```
📧 SIMPLIFIED EMAIL AGENT
Budget: $1

[AGENT] 🧠 LLM call (budget: $1.00)
[AGENT] 📤 Calling: send_email
[ERROR] 🚫 Verification failed

📊 FINAL STATE
Cost: $0.01 (cognition: $0.00, execution: $0.01)
Remaining budget: $0.99
Calls: 1
```

---

## Real LLM Examples

### retry-storm

**What it shows:** Simulated retry storm protection.

**Run:**

```bash
pnpm example:retry-storm
```

**Problem:**

- Email API fails with 503 (transient error)
- Without Mandate: Agent retries indefinitely
- With Mandate: Rate limit stops it at 5 attempts

**Expected output:**

```
❌ WITHOUT MANDATE - Infinite Retry Loop
[EMAIL API] Attempt #1 - 503 Service Unavailable
[EMAIL API] Attempt #2 - 503 Service Unavailable
...
[EMAIL API] Attempt #14 - Success
💸 Could have been 1000+ attempts

✅ WITH MANDATE - Rate Limit Enforced
[EMAIL API] Attempt #1 - 503 Service Unavailable
...
[EMAIL API] Attempt #5 - 503 Service Unavailable
🛑 BLOCKED: Rate limit exceeded: 5/5 in 60000ms
💰 Total cost: $0.05
```

**Key enforcement:**

```typescript
toolPolicies: {
  send_email: {
    rateLimit: { maxCalls: 5, windowMs: 60_000 },
    chargingPolicy: { type: 'ATTEMPT_BASED' }
  }
}
```

---

### retry-storm-llm

**What it shows:** Real LLM agent in retry loop (requires Ollama).

**Run:**

```bash
pnpm example:retry-storm-llm
```

**Demonstrates:**

- ✅ Real LLM (qwen2.5:3b) making decisions
- ✅ Agent sees error and retries autonomously
- ✅ LLM + tool call enforcement
- ✅ Cost breakdown (cognition vs execution)
- ✅ Audit trail showing both LLM and tool actions

**Problem:**

- Email API fails with 503
- LLM decides to retry
- Without Mandate: Agent retries until arbitrary limit
- With Mandate: Rate limit enforced mechanically

**Expected output:**

```
❌ WITHOUT MANDATE - Agent Can Retry Forever
[Iteration 1]
  [LLM] Calling send_email
  [EMAIL API] Attempt #1 - 503 Service Unavailable
[Iteration 2]
  [LLM] Retrying...
  [EMAIL API] Attempt #2 - 503 Service Unavailable
...
⚠️  Hit arbitrary iteration limit (20)

✅ WITH MANDATE - Rate Limit Stops The Loop
[Iteration 1] Budget: $5.00, Calls: 0
  🧠 LLM call (enforced by Mandate)
  📤 Tool call: send_email (enforced by Mandate)
  [EMAIL API] Attempt #1 - Failed
...
[Iteration 6]
  🛑 BLOCKED: Rate limit exceeded: 5/5 in 60000ms
💰 Final cost: $0.05
  - Cognition (LLM): $0.00
  - Execution (Tools): $0.05

📝 Audit Trail:
  [1] 🧠 LLM ALLOW: qwen2.5:3b
  [2] 📤 Tool BLOCK: send_email - Execution failed
  ...
```

---

### budget-runaway

**What it shows:** Budget enforcement prevents overspending.

**Run:**

```bash
pnpm example:budget-runaway
```

**Problem:**

- Agent in infinite loop
- Each iteration calls expensive LLM ($0.50)
- Without Mandate: Burns through $10+ before stopping
- With Mandate: Blocked at $2 budget

**Expected output:**

```
❌ WITHOUT MANDATE - Budget Runaway
[Iteration 1] Cost: $0.50
[Iteration 2] Cost: $1.00
...
[Iteration 21] Cost: $10.50
⚠️  No mechanical stop

✅ WITH MANDATE - Budget Enforced
[Iteration 1] Budget: $2.00
  ✅ Success - Cost: $0.50
[Iteration 2] Budget: $1.50
  ✅ Success - Cost: $1.00
...
[Iteration 5] Budget: $0.00
  🛑 BLOCKED: Cumulative cost 2.5 would exceed limit 2
💰 Final cost: $2.00
```

**Key enforcement:**

```typescript
mandate: {
  maxCostTotal: 2.0;
}
```

---

### tool-permissions

**What it shows:** Allowlist/denylist enforcement.

**Run:**

```bash
pnpm example:tool-permissions
```

**Demonstrates:**

- ✅ Allowlist enforcement (only approved tools)
- ✅ Denylist enforcement (block dangerous tools)
- ✅ Fail-closed (unknown = denied)
- ✅ Glob patterns (`read_*`, `delete_*`)

**Expected output:**

```
✅ ALLOWLIST ENFORCEMENT
Trying read_file (allowed)...
  ✅ ALLOWED

Trying delete_file (not in allowlist)...
  ❌ BLOCKED: Tool 'delete_file' is not in allowlist

🚫 DENYLIST ENFORCEMENT (takes precedence)
Trying read_file (allowed)...
  ✅ ALLOWED

Trying execute_shell (explicitly denied)...
  ❌ BLOCKED: Tool 'execute_shell' is explicitly denied

🔒 FAIL-CLOSED (unknown = denied)
Trying unknown_tool (not in allowlist)...
  ❌ BLOCKED: Tool 'unknown_tool' is not in allowlist
  Reason: Fail-closed - if not explicitly allowed, denied
```

---

### tool-hallucination

**What it shows:** Real LLM calling dangerous tools (requires Ollama).

**Run:**

```bash
pnpm example:tool-hallucination
```

**Problem:**

- LLM receives task: "read config.json, then delete test database"
- LLM tries to call `delete_database` (dangerous)
- Without Mandate: Tool executes unchecked
- With Mandate: Dangerous tool blocked

**Expected output:**

```
❌ WITHOUT MANDATE - Dangerous Tools Can Execute
[AGENT] Calling tool: read_file
  ✅ Executed (no protection!)

[AGENT] Calling tool: delete_database
  💀 DANGER: Would have deleted database 'test'
  ✅ Executed (no protection!)

✅ WITH MANDATE - Only Safe Tools Allowed
[AGENT] Attempting tool: read_file
  ✅ ALLOWED - Tool executed

[AGENT] Attempting tool: delete_database
  🛑 BLOCKED: Tool 'delete_database' is explicitly denied
  🛡️  Mandate prevented dangerous operation

📝 Audit Trail:
  [1] 🧠 LLM ALLOW: qwen2.5:3b
  [2] 📤 Tool ALLOW: read_file
  [3] 📤 Tool BLOCK: delete_database
```

**Key enforcement:**

```typescript
mandate: {
  allowedTools: ['read_*', 'search_*'],
  deniedTools: ['delete_*', 'execute_*', 'drop_*']
}
```

**Why this matters:**

- LLMs **will** try to call dangerous tools
- Prompts are not reliable constraints
- Mechanical enforcement is required

---

## Advanced Examples

### custom-pricing

**What it shows:** 4 pricing scenarios.

**Run:**

```bash
pnpm example:custom-pricing
```

**Demonstrates:**

1. Local model with cost attribution
2. Proprietary/custom models
3. Override default pricing (negotiated rates)
4. Wildcard pricing (provider-wide)

**Expected output:**

```
💰 CUSTOM PRICING EXAMPLES

Example 1: Local Model with Cost Attribution
Custom pricing: {
  "ollama": {
    "llama3.1:8b": {
      "inputTokenPrice": 0.01,
      "outputTokenPrice": 0.02
    }
  }
}

Example 2: Proprietary/Custom Model
Custom pricing: {
  "my-company": {
    "proprietary-model-v1": {
      "inputTokenPrice": 5,
      "outputTokenPrice": 15
    }
  }
}

Example 3: Override Default Pricing
Custom pricing: {
  "openai": {
    "gpt-4o": {
      "inputTokenPrice": 2,
      "outputTokenPrice": 8
    }
  }
}

Example 4: Wildcard Pricing
Custom pricing: {
  "custom-provider": {
    "*": {
      "inputTokenPrice": 1,
      "outputTokenPrice": 3
    }
  }
}
```

---

## Running All Examples

Run all examples sequentially:

```bash
pnpm example:all
```

**Execution order:**

1. email-baseline
2. email-with-mandate
3. email-simple
4. retry-storm
5. budget-runaway
6. tool-permissions
7. retry-storm-llm (requires Ollama)
8. tool-hallucination (requires Ollama)
9. custom-pricing

**Total runtime:** ~2-3 minutes

---

## Creating Your Own Example

### 1. Create the file

```bash
touch src/my-example.ts
```

### 2. Add the example

```typescript
import { MandateClient, createToolAction } from "@mandate/sdk";

async function main() {
  console.log("🚀 My Example");

  const client = new MandateClient({
    mandate: {
      version: 1,
      id: "my-mandate",
      agentId: "my-agent",
      issuedAt: Date.now(),
      maxCostTotal: 10.0,
    },
  });

  const action = createToolAction("my-agent", "my_tool", {});
  const result = await client.executeTool(action, () => myTool());

  console.log("Result:", result);
  console.log("Cost:", client.getCost());
}

main().catch(console.error);
```

### 3. Add npm script

In `package.json`:

```json
{
  "scripts": {
    "example:my-example": "tsx src/my-example.ts"
  }
}
```

### 4. Run it

```bash
pnpm example:my-example
```

---

## Troubleshooting

### Ollama examples fail

**Error:** `Connection refused on localhost:11434`

**Solution:**

```bash
# Start Ollama
ollama serve

# Pull model
ollama pull qwen2.5:3b
```

### "Module not found" errors

**Solution:**

```bash
# Reinstall dependencies
pnpm install

# Build SDK
cd ../sdk
pnpm build
```

### Examples hang or timeout

**For LLM examples:**

- Ollama model needs to be downloaded first
- First run may be slow (model loading)
- Check Ollama is running: `ollama list`

---

## Learn More

- [SDK Documentation](../sdk/README.md)
- [Project Vision](../../VISION.md)
- [Architecture Guide](../../ARCHITECTURE.md)
- [Contributing](../../CONTRIBUTING.md)

---

## License

MIT License - see [LICENSE](../../LICENSE) for details.

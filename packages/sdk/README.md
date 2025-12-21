# @mandate/sdk

**Runtime enforcement for AI agent authority.**

The Mandate SDK provides TypeScript primitives for enforcing AI agent authority at runtime through deterministic policy evaluation, cost tracking, rate limiting, and structured audit logging.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [MandateClient](#mandateclient)
  - [Helper Functions](#helper-functions)
  - [Policy Engine](#policyengine)
  - [State Manager](#statemanager)
  - [Audit Logging](#audit-logging)
  - [Kill Switch](#kill-switch)
- [Advanced Usage](#advanced-usage)
  - [Argument Validation (Phase 2)](#argument-validation-phase-2)
  - [Agent Identity & Mandate Templates (Phase 2)](#agent-identity--mandate-templates-phase-2)
- [Types Reference](#types-reference)
- [Examples](#examples)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Installation

```bash
npm install @mandate/sdk
# or
pnpm add @mandate/sdk
# or
yarn add @mandate/sdk
```

**Requirements:**

- Node.js 18+
- TypeScript 5.0+ (recommended)

---

## Quick Start

### Basic Tool Execution

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
    allowedTools: ["read_*", "search_*"],
  },
});

// 2. Create and execute action
const action = createToolAction("my-agent", "read_file", { path: "/data.txt" });
const result = await client.executeTool(action, () => readFile("/data.txt"));

// 3. Check state
console.log("Cost:", client.getCost());
console.log("Remaining:", client.getRemainingBudget());
```

### LLM Call with Budget Enforcement

```typescript
import OpenAI from "openai";
import { MandateClient } from "@mandate/sdk";

const openai = new OpenAI();
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-llm",
    agentId: "llm-agent",
    issuedAt: Date.now(),
    maxCostTotal: 5.0,
  },
});

// Automatically enforces budget via max_tokens
const response = await client.executeLLMWithBudget(
  "openai",
  "gpt-4o",
  messages,
  (maxTokens) =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: maxTokens, // Calculated from remaining budget
    })
);
```

---

## Core Concepts

### Mandate

A mandate is an authority envelope that defines what an agent can do:

```typescript
interface Mandate {
  // Identity
  version: number;
  id: string;
  agentId: string;
  principal?: string;

  // Temporal bounds
  issuedAt: number;
  expiresAt?: number;

  // Global limits
  maxCostPerCall?: number;
  maxCostTotal?: number;
  rateLimit?: RateLimit;

  // Tool permissions
  allowedTools?: string[]; // ['read_*', 'search']
  deniedTools?: string[]; // ['delete_*', 'execute_*']

  // Tool-specific policies
  toolPolicies?: Record<string, ToolPolicy>;

  // Custom pricing
  customPricing?: ProviderPricing;

  // Default charging policy
  defaultChargingPolicy?: ChargingPolicy;
}
```

### Actions

Actions represent agent operations:

```typescript
// Tool call
const toolAction = createToolAction(
  "agent-1",
  "send_email",
  { to: "user@example.com" },
  0.01 // estimated cost
);

// LLM call
const llmAction = createLLMAction(
  "agent-1",
  "openai",
  "gpt-4o",
  1000, // estimated input tokens
  500 // estimated output tokens
);
```

### Decisions

Every action evaluation produces a decision:

```typescript
type Decision =
  | { type: "ALLOW"; reason: string; remainingCost?: number }
  | { type: "BLOCK"; reason: string; code: BlockCode; hard: boolean };
```

### Enforcement Flow

```
Authorization → Execution → Settlement → Accounting → Audit
     ↓              ↓            ↓            ↓          ↓
  Policy       Your Fn      Cost Calc    Commit      Log
  Engine                   (if success)   State
```

---

## API Reference

### MandateClient

High-level facade for enforcement (recommended API).

#### Constructor

```typescript
new MandateClient(options: MandateClientOptions)
```

**Options:**

```typescript
interface MandateClientOptions {
  mandate: Mandate;
  auditLogger?: AuditLogger | "console" | "memory" | "none" | { file: string };
}
```

**Example:**

```typescript
const client = new MandateClient({
  mandate: {
    version: 1,
    id: "mandate-1",
    agentId: "agent-1",
    issuedAt: Date.now(),
    maxCostTotal: 10.0,
  },
  auditLogger: "console",
});
```

---

#### executeTool()

Execute a tool with enforcement.

```typescript
async executeTool<T>(
  action: Action,
  fn: () => Promise<T>
): Promise<T>
```

**Parameters:**

- `action` - Tool action (use `createToolAction()`)
- `fn` - Function that executes the tool

**Returns:** Tool result

**Throws:** `MandateBlockedError` if blocked

**Example:**

```typescript
const action = createToolAction("agent-1", "read_file", { path: "/data.txt" });
const content = await client.executeTool(action, () => readFile("/data.txt"));
```

---

#### executeLLM()

Execute an LLM call with enforcement.

```typescript
async executeLLM<T>(
  action: Action,
  fn: () => Promise<T>
): Promise<T>
```

**Parameters:**

- `action` - LLM action (use `createLLMAction()`)
- `fn` - Function that calls the LLM

**Returns:** LLM response

**Example:**

```typescript
const action = createLLMAction("agent-1", "openai", "gpt-4o", 1000, 500);
const response = await client.executeLLM(action, () =>
  openai.chat.completions.create({ model: "gpt-4o", messages })
);
```

---

#### executeLLMWithBudget()

Execute LLM call with automatic budget enforcement.

```typescript
async executeLLMWithBudget<T>(
  provider: string,
  model: string,
  messages: any[],
  executor: (maxTokens: number) => Promise<T>
): Promise<T>
```

**Parameters:**

- `provider` - Provider name ('openai', 'anthropic', 'ollama')
- `model` - Model name
- `messages` - Chat messages (for token estimation)
- `executor` - Function that calls LLM with max_tokens

**Returns:** LLM response

**Example:**

```typescript
const response = await client.executeLLMWithBudget(
  "openai",
  "gpt-4o",
  messages,
  (maxTokens) =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: maxTokens, // Auto-calculated from budget
    })
);
```

---

#### getCost()

Get current cost breakdown.

```typescript
getCost(): { total: number; cognition: number; execution: number }
```

**Returns:** Cost breakdown by type

**Example:**

```typescript
const cost = client.getCost();
console.log(`Total: $${cost.total}`);
console.log(`LLM: $${cost.cognition}`);
console.log(`Tools: $${cost.execution}`);
```

---

#### getRemainingBudget()

Get remaining budget.

```typescript
getRemainingBudget(): number | undefined
```

**Returns:** Remaining budget in USD, or `undefined` if no limit

**Example:**

```typescript
const remaining = client.getRemainingBudget();
if (remaining && remaining < 1.0) {
  console.warn("Low budget!");
}
```

---

#### getCallCount()

Get total number of calls.

```typescript
getCallCount(): number
```

**Returns:** Total calls made

---

#### kill()

Emergency stop the agent.

```typescript
kill(reason?: string): void
```

**Parameters:**

- `reason` - Optional reason for killing

**Example:**

```typescript
client.kill("Detected infinite loop");
// All subsequent actions will be blocked
```

---

#### isKilled()

Check if agent is killed.

```typescript
isKilled(): boolean
```

**Returns:** `true` if killed

---

#### resurrect()

Re-enable a killed agent.

```typescript
resurrect(): void
```

**Example:**

```typescript
client.resurrect();
// Agent can execute again
```

---

#### getAuditEntries()

Get audit trail (if using MemoryAuditLogger).

```typescript
getAuditEntries(): AuditEntry[]
```

**Returns:** Array of audit entries

**Example:**

```typescript
const entries = client.getAuditEntries();
entries.forEach((entry) => {
  console.log(`${entry.decision}: ${entry.reason}`);
});
```

---

### Helper Functions

#### createToolAction()

Create a tool action.

```typescript
function createToolAction(
  agentId: string,
  tool: string,
  args?: Record<string, unknown>,
  estimatedCost?: number
): Action;
```

**Example:**

```typescript
const action = createToolAction(
  "agent-1",
  "send_email",
  { to: "user@example.com", subject: "Hello" },
  0.01
);
```

---

#### createLLMAction()

Create an LLM action.

```typescript
function createLLMAction(
  agentId: string,
  provider: string,
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  customPricing?: ProviderPricing
): Action;
```

**Example:**

```typescript
const action = createLLMAction(
  "agent-1",
  "openai",
  "gpt-4o",
  1000, // input tokens
  500 // output tokens
);
```

---

#### executeTool()

Execute tool with enforcement (functional API).

```typescript
async function executeTool<T>(
  action: Action,
  fn: () => Promise<T>,
  mandate: Mandate,
  policy: PolicyEngine,
  stateManager: StateManager,
  auditLogger?: AuditLogger
): Promise<T>;
```

**Example:**

```typescript
import { executeTool, PolicyEngine, StateManager } from "@mandate/sdk";

const policy = new PolicyEngine();
const state = new StateManager();

const result = await executeTool(
  action,
  () => readFile("/data.txt"),
  mandate,
  policy,
  state
);
```

---

#### executeLLM()

Execute LLM with enforcement (functional API).

```typescript
async function executeLLM<T>(
  action: Action,
  fn: () => Promise<T>,
  mandate: Mandate,
  policy: PolicyEngine,
  stateManager: StateManager,
  auditLogger?: AuditLogger
): Promise<T>;
```

---

### PolicyEngine

Pure policy evaluation engine.

#### Constructor

```typescript
new PolicyEngine();
```

#### evaluate()

Evaluate action against mandate.

```typescript
evaluate(
  action: Action,
  mandate: Mandate,
  state: AgentState
): Decision
```

**Pure function - no side effects.**

**Example:**

```typescript
const engine = new PolicyEngine();
const decision = engine.evaluate(action, mandate, state);

if (decision.type === "BLOCK") {
  console.log(`Blocked: ${decision.reason}`);
}
```

---

### StateManager

Manages mutable per-agent state.

#### Constructor

```typescript
new StateManager();
```

#### get()

Get state for an agent.

```typescript
get(agentId: string, mandateId: string): AgentState
```

#### commitSuccess()

Commit state after successful execution.

```typescript
commitSuccess(
  action: Action,
  state: AgentState,
  result?: { actualCost?: number },
  agentRateLimit?: RateLimit,
  toolRateLimit?: RateLimit
): void
```

**CRITICAL:** Only call after execution succeeds.

---

### Audit Logging

#### AuditLogger Interface

```typescript
interface AuditLogger {
  log(entry: AuditEntry): void | Promise<void>;
}
```

#### Built-in Loggers

**ConsoleAuditLogger:**

```typescript
import { ConsoleAuditLogger } from "@mandate/sdk";

const logger = new ConsoleAuditLogger();
// Logs to stdout as JSON
```

**MemoryAuditLogger:**

```typescript
import { MemoryAuditLogger } from "@mandate/sdk";

const logger = new MemoryAuditLogger();
// Stores in memory

const entries = logger.getEntries();
```

**FileAuditLogger:**

```typescript
import { FileAuditLogger } from "@mandate/sdk";

const logger = new FileAuditLogger("/var/log/mandate.log");
// Appends to file
```

**NoOpAuditLogger:**

```typescript
import { NoOpAuditLogger } from "@mandate/sdk";

const logger = new NoOpAuditLogger();
// Discards entries (for testing)
```

**MultiAuditLogger:**

```typescript
import {
  MultiAuditLogger,
  ConsoleAuditLogger,
  FileAuditLogger,
} from "@mandate/sdk";

const logger = new MultiAuditLogger([
  new ConsoleAuditLogger(),
  new FileAuditLogger("/var/log/mandate.log"),
]);
// Logs to multiple destinations
```

---

### Kill Switch

#### KillSwitch Class

```typescript
class KillSwitch {
  kill(agentId: string, mandateId: string, reason?: string): void;
  isKilled(agentId: string, mandateId: string): boolean;
  resurrect(agentId: string, mandateId: string): void;
}
```

**Example:**

```typescript
import { KillSwitch, StateManager } from "@mandate/sdk";

const stateManager = new StateManager();
const killSwitch = new KillSwitch(stateManager);

// Kill agent
killSwitch.kill("agent-1", "mandate-1", "Manual termination");

// Check status
if (killSwitch.isKilled("agent-1", "mandate-1")) {
  console.log("Agent is killed");
}

// Resurrect
killSwitch.resurrect("agent-1", "mandate-1");
```

---

## Advanced Usage

### Custom Charging Policies

Define how tools are charged:

```typescript
const mandate: Mandate = {
  // ...
  toolPolicies: {
    // Charge on success only
    send_email: {
      chargingPolicy: {
        type: "SUCCESS_BASED",
      },
    },

    // Charge on attempt (even if fails)
    lambda_invoke: {
      chargingPolicy: {
        type: "ATTEMPT_BASED",
      },
    },

    // Tiered pricing
    bulk_operation: {
      chargingPolicy: {
        type: "TIERED",
        attemptCost: 0.001,
        successCost: 0.01,
      },
    },

    // Custom logic (must be pure!)
    custom_tool: {
      chargingPolicy: {
        type: "CUSTOM",
        compute: (ctx) => {
          return ctx.executionSuccess ? 0.05 : 0.01;
        },
      },
    },
  },
};
```

**IMPORTANT:** Custom charging functions must be:

- Pure (no side effects)
- Deterministic (same input = same output)
- Synchronous (no async operations)

---

### Custom Pricing

Override default pricing:

```typescript
const mandate: Mandate = {
  // ...
  customPricing: {
    // Local model with cost attribution
    ollama: {
      "llama3.1:8b": {
        inputTokenPrice: 0.01,
        outputTokenPrice: 0.02,
      },
    },

    // Negotiated rates
    openai: {
      "gpt-4o": {
        inputTokenPrice: 2.0,
        outputTokenPrice: 8.0,
      },
    },

    // Wildcard for provider
    "my-company": {
      "*": {
        inputTokenPrice: 5.0,
        outputTokenPrice: 15.0,
      },
    },
  },
};
```

---

### Tool-Specific Rate Limits

Different rate limits per tool:

```typescript
const mandate: Mandate = {
  // ...
  toolPolicies: {
    send_email: {
      rateLimit: {
        maxCalls: 10,
        windowMs: 60_000, // 10 emails per minute
      },
    },

    api_call: {
      rateLimit: {
        maxCalls: 100,
        windowMs: 60_000, // 100 API calls per minute
      },
    },
  },
};
```

---

### Result Verification

Verify tool results before accepting:

```typescript
const mandate: Mandate = {
  // ...
  toolPolicies: {
    send_email: {
      verifyResult: (ctx) => {
        const result = ctx.result as EmailResult;

        // Verify delivery confirmed
        if (!result.deliveryConfirmed) {
          return {
            ok: false,
            reason: "Email not delivered",
          };
        }

        return { ok: true };
      },

      chargingPolicy: {
        type: "SUCCESS_BASED", // Only charge if verified
      },
    },
  },
};
```

---

### Argument Validation (Phase 2)

Validate tool arguments before execution using Zod schemas and custom validation functions:

```typescript
import { z, CommonSchemas, ValidationPatterns } from "@mandate/sdk";

const mandate: Mandate = {
  // ...
  toolPolicies: {
    read_file: {
      argumentValidation: {
        // Zod schema for type validation
        schema: CommonSchemas.filePath,

        // Custom validation function
        validate: ValidationPatterns.noSystemPaths,
      },
    },

    send_email: {
      argumentValidation: {
        schema: CommonSchemas.email,
        validate: ValidationPatterns.internalEmailOnly("company.com"),
      },
    },

    execute_query: {
      argumentValidation: {
        schema: CommonSchemas.sqlQuery,
        validate: ValidationPatterns.readOnlySql,
      },
    },
  },
};
```

**Built-in CommonSchemas:**

- `CommonSchemas.filePath` - File path with non-empty validation
- `CommonSchemas.email` - Email format validation
- `CommonSchemas.sqlQuery` - SQL query validation
- `CommonSchemas.apiCall` - API endpoint validation

**Built-in ValidationPatterns:**

- `ValidationPatterns.noSystemPaths` - Block /etc/, /sys/, /proc/, path traversal
- `ValidationPatterns.internalEmailOnly(domain)` - Only allow specific email domain
- `ValidationPatterns.readOnlySql` - Block INSERT, UPDATE, DELETE, DROP, ALTER, CREATE

**Custom Zod schemas:**

```typescript
import { z } from "@mandate/sdk";

const mandate: Mandate = {
  toolPolicies: {
    transfer_money: {
      argumentValidation: {
        schema: z.object({
          amount: z.number().max(10000, "Amount exceeds limit"),
          recipient: z.string().email(),
        }),
      },
    },
  },
};
```

**Custom validation functions:**

```typescript
{
  argumentValidation: {
    validate: (ctx) => {
      const amount = ctx.args.amount as number;
      const time = new Date().getHours();

      if (amount > 1000 && (time < 9 || time > 17)) {
        return {
          allowed: false,
          reason: "Large transfers only allowed during business hours",
        };
      }

      return { allowed: true };
    };
  }
}
```

**Combining schema and custom validation:**

Both validations must pass. Schema validation runs first (type checking), then custom validation (business logic).

```typescript
{
  argumentValidation: {
    schema: z.object({
      path: z.string().min(1)
    }),
    validate: (ctx) => {
      // Custom logic after type validation
      if (ctx.args.path.includes('secret')) {
        return { allowed: false, reason: 'Access denied' };
      }
      return { allowed: true };
    }
  }
}
```

---

### Agent Identity & Mandate Templates (Phase 2)

Create mandates with stable agent identities and sensible defaults:

```typescript
import { createMandate, MandateTemplates } from "@mandate/sdk";

// Using templates (recommended)
const mandate = MandateTemplates.production("user@example.com", {
  description: "Email automation agent",
});

// Custom mandate
const mandate = createMandate({
  principal: "user@example.com",
  description: "Data analysis agent",
  maxCostTotal: 100.0,
  allowedTools: ["read_*", "search_*"],
  expiresInMs: 86400000, // 24 hours
});
```

**Available Templates:**

| Template      | Use Case            | Budget | Lifetime  | Tools                        |
| ------------- | ------------------- | ------ | --------- | ---------------------------- |
| `restricted`  | Minimal permissions | $1     | 1 hour    | read\_\* only                |
| `development` | Testing/dev         | $10    | 24 hours  | All except drop\_\*          |
| `production`  | Production agents   | $100   | No expiry | read*\*, search*\_, send\_\_ |
| `temporary`   | Short-lived tasks   | $0.50  | 5 minutes | Rate limited (10 calls/min)  |

**Customizing templates:**

```typescript
const mandate = MandateTemplates.production("user@example.com", {
  maxCostTotal: 50.0, // Override budget
  allowedTools: ["read_*", "write_*"], // Override tools
  deniedTools: ["delete_*"], // Override denies
  expiresInMs: 3600000, // Add 1 hour expiration
});
```

**Agent Identity:**

Every mandate includes an agent identity with:

- Stable `agentId` (persists across restarts)
- `principal` (owner/responsible party)
- Optional `description` and `metadata`

```typescript
const mandate = createMandate({
  agentId: "email-bot-prod", // Custom stable ID
  principal: "user@example.com",
  description: "Production email automation",
  metadata: { team: "sales", region: "us-east" },
});

console.log(mandate.identity?.agentId); // 'email-bot-prod'
```

---

## Types Reference

### Mandate

```typescript
interface Mandate {
  version: number;
  id: string;
  agentId: string;
  principal?: string;
  issuedAt: number;
  expiresAt?: number;
  maxCostPerCall?: number;
  maxCostTotal?: number;
  rateLimit?: RateLimit;
  allowedTools?: string[];
  deniedTools?: string[];
  toolPolicies?: Record<string, ToolPolicy>;
  customPricing?: ProviderPricing;
  defaultChargingPolicy?: ChargingPolicy;
}
```

### ToolPolicy

```typescript
interface ToolPolicy {
  maxCostPerCall?: number;
  rateLimit?: RateLimit;
  chargingPolicy?: ChargingPolicy;
  verifyResult?: (ctx: VerificationContext) => VerificationDecision;
}
```

### Action

```typescript
type Action = ToolCall | LLMCall;

interface ToolCall {
  type: "tool_call";
  id: string;
  agentId: string;
  timestamp: number;
  tool: string;
  args?: Record<string, unknown>;
  estimatedCost?: number;
  costType?: "COGNITION" | "EXECUTION";
}

interface LLMCall {
  type: "llm_call";
  id: string;
  agentId: string;
  timestamp: number;
  provider: "openai" | "anthropic" | "ollama" | string;
  model: string;
  estimatedCost?: number;
  costType?: "COGNITION" | "EXECUTION";
}
```

### Decision

```typescript
type Decision =
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
      hard: boolean;
    };

type BlockCode =
  | "TOOL_NOT_ALLOWED"
  | "TOOL_DENIED"
  | "COST_LIMIT_EXCEEDED"
  | "RATE_LIMIT_EXCEEDED"
  | "MANDATE_EXPIRED"
  | "AGENT_KILLED"
  | "UNKNOWN_TOOL"
  | "DUPLICATE_ACTION";
```

### ChargingPolicy

```typescript
type ChargingPolicy =
  | { type: "SUCCESS_BASED" }
  | { type: "ATTEMPT_BASED" }
  | {
      type: "TIERED";
      attemptCost: number;
      successCost: number;
      verificationCost?: number;
    }
  | {
      type: "CUSTOM";
      compute: (ctx: ChargingContext) => number;
    };
```

---

## Examples

See [../examples](../examples) for complete working examples:

- **email-baseline.ts** - Without enforcement (baseline)
- **email-with-mandate.ts** - Full enforcement (all 8 layers)
- **email-simple.ts** - Simplified with MandateClient
- **retry-storm.ts** - Rate limiting prevents loops
- **retry-storm-llm.ts** - Real LLM agent in retry loop
- **budget-runaway.ts** - Cost limits prevent overspending
- **tool-permissions.ts** - Allowlist/denylist enforcement
- **tool-hallucination.ts** - Real LLM calling dangerous tools
- **custom-pricing.ts** - Custom pricing scenarios

---

## Testing

Run the test suite:

```bash
# All tests
pnpm test

# Watch mode
pnpm test --watch

# Coverage
pnpm test --coverage

# Specific test file
pnpm test policy.test.ts
```

---

## Troubleshooting

### "Tool not allowed" but tool is in allowlist

**Check glob pattern matching:**

```typescript
// ❌ Won't match
allowedTools: ["read_file"];
tool: "read_files"; // Different name

// ✅ Will match
allowedTools: ["read_*"];
tool: "read_files";
```

### Cost is NaN

**Ensure pricing is defined:**

```typescript
// Add custom pricing for unknown models
customPricing: {
  'my-provider': {
    'my-model': {
      inputTokenPrice: 0.01,
      outputTokenPrice: 0.02
    }
  }
}
```

### Rate limit not resetting

**Check window timing:**

```typescript
// Rate limit window is 60 seconds
rateLimit: { maxCalls: 100, windowMs: 60_000 }

// If calls happen within 60s window, count accumulates
// Window resets after 60s from first call
```

### Agent state not persisting

**Phase 1 limitation:**

- State is in-memory only
- Resets on process restart
- Not shared across multiple processes

Use Phase 3 distributed state for persistence.

---

## Learn More

- [Project Vision](../../VISION.md)
- [Architecture Guide](../../ARCHITECTURE.md)
- [Future Features](../../FUTURE_FEATURES.md)
- [Contributing](../../CONTRIBUTING.md)

---

## License

MIT License - see [LICENSE](../../LICENSE) for details.

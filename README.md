# Mandate SDK

Runtime enforcement layer for AI agent authority. Intercepts LLM and tool calls, evaluates them against policies, and blocks unauthorized actions.

**Status:** Phase 1 MVP - In Development

## What This Is

Mandate SDK makes agent authority **enforceable at runtime**:

- **Intercepts** LLM calls and tool executions before they happen
- **Evaluates** each action against defined policies (cost limits, tool permissions, rate limits)
- **Blocks** unauthorized actions with clear error messages
- **Tracks** cumulative cost and rate limits per agent
- **Audits** every decision for compliance and debugging

This is **not** a guardrail SDK. This is authority infrastructure.

## Quick Example

```typescript
import { Mandate } from '@mandate/sdk';
import OpenAI from 'openai';

// Define what your agent is allowed to do
const mandate = Mandate.create({
  agentId: 'my-agent',
  maxCostTotal: 10.00,           // Never spend more than $10
  allowedTools: ['read_*', 'search'],  // Only these tools
  deniedTools: ['delete_*', 'execute_*'] // Never these tools
});

// Wrap your LLM client
const client = new OpenAI({ apiKey: '...' });
const wrapped = mandate.wrap(client);

// Use normally - enforcement is automatic
const response = await wrapped.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
// ✓ Allowed - within budget and permissions

// This would be blocked:
const badResponse = await wrapped.chat.completions.create({
  model: 'gpt-4',
  messages: [...] // Too expensive
});
// ✗ Throws MandateBlockedError: "Cumulative cost $10.50 exceeds limit $10.00"
```

## Installation

```bash
npm install @mandate/sdk
# or
pnpm add @mandate/sdk
```

## Core Concepts

### Mandate

The authority envelope - defines what an agent is allowed to do.

```typescript
interface Mandate {
  agentId: string; // Who this applies to
  maxCostTotal?: number; // Total budget
  maxCostPerCall?: number; // Per-action ceiling
  allowedTools?: string[]; // Whitelist (glob patterns)
  deniedTools?: string[]; // Blacklist (takes precedence)
  rateLimit?: RateLimit; // Calls per time window
}
```

### Decision

The outcome of policy evaluation - either ALLOW or BLOCK.

```typescript
type Decision =
  | { type: "ALLOW"; reason: string; remainingCost?: number }
  | { type: "BLOCK"; reason: string; code: BlockCode; hard: boolean };
```

### Two-Phase Enforcement

Critical pattern - prevents false positives on retry:

```
1. Authorize (check policy)
2. Execute (can fail)
3. Commit (only if success)
```

If execution fails (network error, timeout), state is unchanged. Retries are safe.

## Development

### Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Type check
pnpm type-check

# Build
pnpm build
```

### Project Structure

```
mandate/
├── src/
│   ├── types.ts        # Core type definitions
│   ├── policy.ts       # PolicyEngine (pure evaluation)
│   ├── state.ts        # StateManager (commit-after-success)
│   ├── executor.ts     # executeWithMandate (two-phase primitive)
│   ├── patterns.ts     # Glob matching for tool permissions
│   └── index.ts        # Public API exports
├── tests/
│   └── *.test.ts       # Test files mirror src/
├── docs/
│   ├── TRACKER.md      # Project status and tasks
│   └── context/        # Reference documentation
└── .cursor/
    └── rules/          # Cursor AI configuration
```

### Cursor Setup

This project uses Cursor AI with custom rules for consistent development:

- `.cursor/rules/core.mdc` - Core development standards
- `.cursor/rules/testing.mdc` - Test conventions
- `.cursor/rules/sdk.mdc` - SDK-specific patterns
- `docs/TRACKER.md` - Current tasks and progress

To get started:

1. Open project in Cursor: `cursor .`
2. Rules auto-apply based on file patterns
3. Check `docs/TRACKER.md` for current work
4. Follow TDD: test → implement → commit

### Key Principles

1. **Fail-closed:** Unknown = denied, always
2. **Deterministic:** Same input = same output
3. **Pure evaluation:** PolicyEngine never mutates state
4. **Commit-after-success:** State only changes on successful execution
5. **Test-driven:** Write test first, then implement

## Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test policy.test.ts

# Run with coverage
pnpm test -- --coverage

# Watch mode
pnpm test -- --watch
```

Tests follow strict TDD:

1. Write failing test
2. Run to verify failure
3. Implement minimal code
4. Run to verify pass
5. Commit

## Architecture

### Components

```
Wrapper (orchestrates)
  ↓
PolicyEngine (pure evaluation)
  ↓
Executor (runs action)
  ↓
StateManager (commits state)
  ↓
AuditLogger (records decision)
```

Each component has one job:

- **Wrapper:** Intercepts LLM/tool calls
- **PolicyEngine:** Evaluates against mandate (pure function)
- **Executor:** Runs action if allowed
- **StateManager:** Tracks cumulative state
- **AuditLogger:** Records all decisions

### Decision Flow

```
Action requested
  ↓
Replay check → Kill switch → Expiration → Tool permissions → Cost limits → Rate limits
  ↓                                                                          ↓
BLOCK                                                                      ALLOW
  ↓                                                                          ↓
Throw MandateBlockedError                                              Execute action
                                                                             ↓
                                                                     Commit state
                                                                             ↓
                                                                        Audit log
```

## Documentation

- **Vision:** `/mnt/project/VISION.md` - KYA (Know Your Agent)
- **Authority Model:** `/mnt/project/AUTHORITY_MODEL_v1.md` - Canonical types
- **Architecture:** `/mnt/project/ARCHITECTURE.md` - System design
- **Implementation Plan:** `docs/plans/2024-12-20-mandate-sdk-phase1.md`
- **Task Tracker:** `docs/TRACKER.md` - Current status

## Phase 1 Scope

**In Scope:**

- Tool/LLM call interception
- Policy evaluation (cost, rate limits, tool permissions)
- State tracking (in-memory)
- Audit logging (stdout/file)
- Kill switch

**Out of Scope (Later Phases):**

- Dashboards/UI
- Distributed coordination
- Python SDK (TypeScript is canonical)
- Crypto/signatures
- Content moderation

See `NON_GOALS.md` for full list.

## Contributing

1. Check `docs/TRACKER.md` for available tasks
2. Create feature branch
3. Follow TDD (test → implement → commit)
4. Run `pnpm test` and `pnpm type-check`
5. Update `docs/TRACKER.md`
6. Submit PR

## Performance Budget

- Total overhead: < 50ms p99
- PolicyEngine evaluation: < 1ms
- State lookup: < 5ms
- Audit logging: async (non-blocking)

## License

MIT

---

**Built with:** TypeScript (strict), Node.js 18+, Vitest, pnpm

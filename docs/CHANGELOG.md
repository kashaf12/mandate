# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-12-21

### Added

#### Core Enforcement (Phase 1)

- **PolicyEngine** - Pure function policy evaluation with <1ms latency
- **StateManager** - Commit-after-success pattern prevents double-charging
- **Two-phase executor** - Authorize → Execute → Settle → Commit → Audit
- **Cost tracking** - Separate cognition (LLM) and execution (tools) costs
- **Rate limiting** - Agent-level and tool-level rate limits with sliding windows
- **Kill switch** - Emergency agent termination (local to SDK instance)
- **Audit logging** - Structured JSON logs with full decision context

#### Charging Policies

- **SUCCESS_BASED** - Charge only on successful execution
- **ATTEMPT_BASED** - Charge on every attempt (even failures)
- **TIERED** - Different costs for attempt, success, verification
- **CUSTOM** - User-defined pure functions for pricing logic

#### Custom Pricing

- Built-in pricing for OpenAI, Anthropic, Groq
- Custom pricing per provider/model
- Wildcard pricing (`ollama/*` = free)
- Missing pricing defaults to $0 with warning

#### Developer Experience

- **MandateClient** - High-level facade API (recommended)
- **Helper functions** - `createToolAction()`, `createLLMAction()`, etc.
- **executeLLMWithBudget()** - One-line LLM execution with automatic budget enforcement
- **Result verification** - Optional validation before accepting tool results

#### Audit & Observability

- **ConsoleAuditLogger** - Log to stdout (JSON)
- **MemoryAuditLogger** - Store in memory for testing
- **FileAuditLogger** - Append to file
- **MultiAuditLogger** - Log to multiple destinations
- Correlation IDs for distributed tracing
- Cost breakdown by action type

#### Testing

- 173 passing tests across 8 layers
- Full test coverage for policy engine, state management, charging
- Property tests for determinism
- Integration tests for real LLM providers

#### Examples

- 9 working examples (simulated + real LLM)
- Email agent with verification
- Retry storm prevention (simulated + real LLM with Ollama)
- Budget runaway prevention
- Tool permission enforcement
- Tool hallucination protection (real LLM)
- Custom pricing scenarios

#### Documentation

- Comprehensive README with enforcement examples
- Full API reference
- Architecture guide
- Future features roadmap (Phase 2-5)
- Contributing guidelines
- 7 invariants documented

### Design Decisions

- **Fail-closed by default** - Unknown = denied
- **Deterministic** - Same input = same output, always
- **Explainable** - Every decision has a reason
- **Type-safe** - Strict TypeScript throughout
- **Zero dependencies** - Core SDK has no runtime deps
- **In-memory state** - Phase 1 limited to single process

### Known Limitations (Phase 1)

- **Per-process enforcement** - Not global per-agent (Phase 3)
- **Local kill switch** - Doesn't propagate across instances
- **In-memory state** - No persistence across restarts
- **No distributed coordination** - Budget can multiply across deployments

### Breaking Changes

N/A - Initial release

---

## Future Releases

See [FUTURE_FEATURES.md](./FUTURE_FEATURES.md) for planned features.

### Phase 2 (Q1 2025)

- Argument validation (block dangerous args)
- Agent identity formalization
- Mandate issuance API

### Phase 3 (Q2 2025)

- Distributed state (Redis)
- Global per-agent limits
- Distributed kill switch

### Phase 4 (Q3 2025)

- Delegation chains
- Authority inheritance

### Phase 5 (Q4 2025)

- Cryptographic signatures
- Verifiable credentials
- Optional onchain proofs

---

[Unreleased]: https://github.com/kashaf12/mandate/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kashaf12/mandate/releases/tag/v0.1.0

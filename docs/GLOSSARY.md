# Glossary: Canonical Definitions

Use these terms consistently across all documentation, code, and communication.

---

## Core Concepts

### Mandate
The authority envelope that defines what an agent is allowed to do. A mandate specifies identity, limits, permissions, and temporal bounds. Mandates are immutable — to change authority, revoke and reissue.

### Authority
The permission to perform a specific action. Authority is granted through mandates and consumed through execution. Authority can be limited, scoped, and revoked.

### Enforcement
The mechanical act of evaluating an action against a mandate and producing an ALLOW or BLOCK decision. Enforcement happens outside the LLM, at runtime, before execution.

### Decision
The outcome of policy evaluation: ALLOW, BLOCK, or DEFER (future). Every decision includes a reason string and, for blocks, a specific code.

---

## Identity

### Agent
An autonomous process that can make decisions and take actions. In Mandate, agents are identified by a stable `agentId` and governed by mandates.

### Agent Identity
A stable, unique identifier for an agent instance. Not the same as a process ID or server — an agent identity persists across restarts and infrastructure.

### Principal
The human or organization responsible for an agent. The principal issues mandates and bears accountability for the agent's actions.

### Issuer
The entity that creates and signs a mandate. In v0, the issuer is implicit (whoever configures the SDK). In later phases, issuers are cryptographically identified.

---

## Permissions

### Allowed Tools
A whitelist of tools an agent is permitted to use. Supports exact names and glob patterns. If an allowlist exists, unlisted tools are denied.

### Denied Tools
A blacklist of tools an agent is forbidden to use. Takes precedence over allowed tools. Supports exact names and glob patterns.

### Scope
Additional restrictions on what an agent can do, beyond tool permissions. Examples: read-only mode, resource restrictions. (Future feature.)

---

## Limits

### Cost Limit
Maximum monetary cost an agent can incur. Can be per-call (`maxCostPerCall`) or cumulative (`maxCostTotal`). Exceeding the limit blocks the action.

### Rate Limit
Maximum number of actions in a time window. Defined as calls per milliseconds. Exceeding the limit blocks the action.

### Budget
Informal term for cost limit. Prefer "cost limit" in technical documentation.

---

## Lifecycle

### Kill Switch
Instant termination of an agent's authority. When killed, all subsequent actions are blocked immediately. Can be per-agent or global.

### Expiration
Temporal bound on a mandate. After `expiresAt`, the mandate is no longer valid and all actions are blocked.

### Revocation
The act of terminating a mandate before expiration. In v0, equivalent to killing the agent. In later phases, revocation propagates through the system.

---

## Audit

### Audit Entry
A structured record of a decision. Includes timestamp, agent ID, action details, decision, reason, and cost information. Every action produces an audit entry.

### Audit Log
The collection of audit entries. Output to stdout, file, or custom handler. Used for debugging, compliance, and incident investigation.

### Reason
Human-readable explanation for why a decision was made. Every ALLOW and BLOCK includes a reason string.

### Block Code
Machine-readable code for why an action was blocked. Examples: `TOOL_NOT_ALLOWED`, `COST_LIMIT_EXCEEDED`, `AGENT_KILLED`.

---

## Architecture

### Wrapper
The SDK component that intercepts LLM client calls. Wraps OpenAI, Anthropic, or other clients to inject enforcement.

### Policy Engine
The SDK component that evaluates actions against mandates. Pure function, deterministic, fast.

### State Manager
The SDK component that tracks mutable per-agent state (cumulative cost, call count, kill status).

### Coordinator
(Future) A service that manages distributed state across multiple SDK instances. Enables global per-agent limits.

---

## Patterns

### Fail-Closed
Default behavior when something is unknown or uncertain: deny the action. Unknown tool = blocked. Missing mandate = blocked. SDK error = blocked.

### Deterministic
Same input produces same output, always. Policy evaluation is deterministic. No randomness, no AI judgment.

### Explainable
Every decision can be traced to a specific rule and input. No black boxes.

---

## Anti-Patterns (Don't Use)

### Guardrails
Avoid this term — it implies soft limits that can be pushed through. Mandate enforces hard limits.

### Safety
Avoid this term — it implies content moderation or alignment. Mandate is about authority, not safety.

### Governance
Avoid this term in Phase 1 — it implies enterprise compliance. That comes later.

### Smart / Intelligent
Never describe enforcement as smart or intelligent. Enforcement is mechanical and deterministic.

---

## Abbreviations

| Abbrev | Meaning |
|--------|---------|
| KYA | Know Your Agent |
| KYC | Know Your Customer (analogy) |
| SDK | Software Development Kit |
| LLM | Large Language Model |
| IAM | Identity and Access Management (analogy) |

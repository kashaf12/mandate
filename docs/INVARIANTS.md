# Invariants: The Seven Discovered Problems

These are not features. They are failures of reality that emerge once you take agent authority seriously.

Each problem reveals a deeper invariant. Solving them is your roadmap.

---

## Problem 1: Distributed Budget Leakage

**What happens:**
- Agent runs on 5 servers
- Each server enforces $100 limit
- Agent spends $500 total

**Why it happens:**
- Enforcement is local
- Authority is assumed to be global
- No coordination

**Invariant revealed:**
> Execution limits must be enforced at the agent identity level, not the infrastructure instance level.

**Forces:**
- Shared accounting
- Coordination
- Agent identity

---

## Problem 2: Delegation Amplification

**What happens:**
- Agent A has limited authority
- Agent A delegates to Agent B
- Agent B performs actions Agent A could not

**Why it happens:**
- No concept of authority inheritance
- No limit on delegation depth
- No reduction of scope

**Analogy:**
A junior employee asks an intern to do something the junior wasn't allowed to do.

**Invariant revealed:**
> Agents cannot delegate more authority than they possess.

**Forces:**
- Delegation rules
- Mandate inheritance
- Authority reduction

---

## Problem 3: Identity Collapse

**What happens:**
- Logs say "the agent did it"
- But: which agent? Owned by whom? Acting for whom?

**Why it happens:**
- Agents are treated as processes, not identities
- No stable agent IDs
- No ownership metadata

**Analogy:**
A shared AWS root account — everything is possible, nothing is accountable.

**Invariant revealed:**
> Every action must be attributable to a stable agent identity.

**Forces:**
- Stable `agentId`
- Principal tracking
- Ownership metadata

---

## Problem 4: Replay & Double-Spend of Authority

**What happens:**
- Agent retries a tool call
- Or replays a previous plan
- Or crashes and resumes
- Same "allowed" action happens twice

**Why it happens:**
- No notion of action uniqueness
- No idempotency
- Authority is not consumed

**Analogy:**
Reusing the same signed cheque twice.

**Invariant revealed:**
> Authority must be consumable and non-replayable.

**Forces:**
- Nonce-based execution
- Mandate state
- Eventually: ledger-like behavior

---

## Problem 5: Cross-System Trust Breakdown

**What happens:**
- Agent from System A calls tools in System B
- System B has no idea:
  - Who issued this agent's authority
  - Whether it's still valid
  - Whether it's been revoked

**Why it happens:**
- Authority is implicit
- No portable proof of mandate

**Analogy:**
Showing up at a secure building saying "Trust me, I'm allowed in."

**Invariant revealed:**
> Authority must be verifiable outside the issuing system.

**Forces:**
- Signed mandates
- Portable credentials
- Cross-org verification

---

## Problem 6: Silent Partial Failure

**What happens:**
- Some servers enforce limits
- Others lag behind
- Some actions succeed, some fail
- Inconsistent system state

**Why it happens:**
- No shared source of truth
- No convergence guarantees
- Eventual consistency without coordination

**Analogy:**
A distributed transaction without a coordinator.

**Invariant revealed:**
> Enforcement decisions must converge across the system.

**Forces:**
- Coordination
- Eventual consistency with defined semantics
- Or: a ledger

---

## Problem 7: Human Override Without Trace

**What happens:**
- Engineer bypasses guardrails "temporarily"
- No record of who did it
- No record of why

**Why it happens:**
- No explicit override mechanism
- No audit trail for exceptions

**Analogy:**
Breaking a seal without leaving evidence.

**Invariant revealed:**
> Overrides must be explicit, scoped, and auditable.

**Forces:**
- Override API
- Audit trail
- Accountability for exceptions

---

## Summary Table

| # | Problem | Invariant | Phase |
|---|---------|-----------|-------|
| 1 | Distributed Budget Leakage | Limits per agent identity, not instance | 3 |
| 2 | Delegation Amplification | Cannot delegate more than you have | 4 |
| 3 | Identity Collapse | Every action → stable agent ID | 2 |
| 4 | Replay / Double-Spend | Authority is consumable | 3-4 |
| 5 | Cross-System Trust | Authority verifiable outside issuer | 5 |
| 6 | Silent Partial Failure | Enforcement must converge | 3 |
| 7 | Override Without Trace | Overrides are auditable | 1-2 |

---

## How to Use This Document

1. When a bug or incident occurs, check if it maps to one of these problems
2. If yes, you've hit an invariant break — time to solve it
3. If no, it might be a feature request in disguise — be skeptical

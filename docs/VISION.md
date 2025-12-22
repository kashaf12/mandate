# Vision: Know Your Agent (KYA)

## The Core Problem

AI agents are becoming economic actors. They spend money, call APIs, modify infrastructure, and make decisions with real-world consequences.

But they exist as **unbanked ghosts**:

- Anonymous
- Fungible
- Prompt-constrained
- Operationally unaccountable

They are treated like scripts but behave like employees.

This mismatch is the problem.

---

## The Insight

> The moment an agent can act in the real world, it must be governable at the **identity level** — not the server level, not the prompt level.

Prompts are suggestions. Enforcement is mechanical.

---

## What KYA Means

KYA (Know Your Agent) answers four questions **mechanically**:

| Question                      | Domain    |
| ----------------------------- | --------- |
| Who is this agent?            | Identity  |
| Who owns it / is responsible? | Principal |
| What is it allowed to do?     | Authority |
| What actually happened?       | Audit     |

If you cannot answer all four programmatically, you do not have KYA.

---

## Why This Matters Now

In financial services, non-human identities outnumber human employees **96-to-1**.

The industry built KYC infrastructure over decades. It has months to figure out KYA.

Until KYA exists:

- Merchants will block agents at the firewall
- Agents cannot transact safely
- Liability is undefined
- Trust cannot scale

---

## The Destination

Full KYA infrastructure:

- Agents have stable, verifiable identities
- Authority is explicit, scoped, and revocable
- Limits apply per agent, globally (not per server) - **Available now (RedisStateManager)**
- Delegation is controlled and auditable
- Actions are attributable
- Trust can cross organizational boundaries

**Note:**

- **Local enforcement:** MemoryStateManager provides agent-level enforcement within a single process
- **Distributed enforcement:** RedisStateManager provides global enforcement across multiple servers (available now)
- **Future:** Centralized mandate issuance, revocation APIs, and cryptographic verification

---

## The Vehicle

**Mandate SDK** is Phase 1.

It is where agent authority stops being a concept and starts being enforceable.

The SDK is not the vision. It is the first enforcement surface.

---

## The Anchor Sentence

> We are building developer infrastructure for agent authority. KYA is the destination, not the starting point.

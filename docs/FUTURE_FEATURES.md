# Future Features

This document tracks features planned for future phases of Mandate SDK. These are **not** in scope for Phase 1 but are important parts of the roadmap.

---

## Phase 2: Agent Identity & Advanced Policies

### Argument Validation

**Problem:**

- Tool name enforcement isn't enough
- Agent might call `read_file` (allowed) but with dangerous args: `{ path: "/etc/passwd" }`
- Agent might call `execute_command` with `{ command: "rm -rf /" }`

**Solution: Argument-level policies**

```typescript
{
  toolPolicies: {
    read_file: {
      // Allow tool, but validate arguments
      argumentSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' }
        },
        required: ['path']
      },

      // Block dangerous patterns
      argumentValidation: (args) => {
        const path = args.path as string;

        // Block system files
        if (path.startsWith('/etc/') || path.startsWith('/sys/')) {
          return {
            allowed: false,
            reason: 'System paths not allowed'
          };
        }

        // Block parent directory traversal
        if (path.includes('../')) {
          return {
            allowed: false,
            reason: 'Path traversal not allowed'
          };
        }

        return { allowed: true };
      }
    },

    execute_command: {
      argumentValidation: (args) => {
        const command = args.command as string;

        // Deny list of dangerous commands
        const dangerous = ['rm -rf', 'dd if=', 'mkfs', ':(){:|:&};:'];

        for (const pattern of dangerous) {
          if (command.includes(pattern)) {
            return {
              allowed: false,
              reason: `Dangerous command pattern: ${pattern}`
            };
          }
        }

        return { allowed: true };
      }
    }
  }
}
```

**Use Cases:**

1. **Path Restrictions**

   ```typescript
   // Allow read_file, but only from /data/
   argumentValidation: (args) => {
     return {
       allowed: args.path.startsWith("/data/"),
       reason: "Only /data/ paths allowed",
     };
   };
   ```

2. **Email Restrictions**

   ```typescript
   // Allow send_email, but only to internal domains
   argumentValidation: (args) => {
     const domain = args.to.split("@")[1];
     return {
       allowed: domain === "company.com",
       reason: "Only internal emails allowed",
     };
   };
   ```

3. **SQL Query Validation**

   ```typescript
   // Allow execute_query, but block writes
   argumentValidation: (args) => {
     const query = args.sql.toLowerCase();
     const isRead = query.startsWith("select");
     return {
       allowed: isRead,
       reason: "Only SELECT queries allowed",
     };
   };
   ```

4. **API Endpoint Restrictions**
   ```typescript
   // Allow api_call, but only to approved endpoints
   argumentValidation: (args) => {
     const approved = ["api.stripe.com", "api.github.com"];
     const url = new URL(args.url);
     return {
       allowed: approved.includes(url.hostname),
       reason: "Only approved APIs allowed",
     };
   };
   ```

**Design Principles:**

1. **Fail-closed** - Unknown arguments = denied
2. **Pure functions** - No side effects, deterministic
3. **Explicit denial** - Clear reason for every block
4. **Schema validation** - Type safety before custom logic
5. **Audit trail** - Log blocked arguments

**Implementation Notes:**

- Add `argumentSchema` (JSON Schema) for type validation
- Add `argumentValidation` for custom logic
- Both evaluated **before** execution
- Blocked arguments logged in audit trail
- Compatible with existing tool permissions

**Why Phase 2, Not Phase 1:**

1. Phase 1 establishes core enforcement primitives
2. Argument validation adds significant complexity
3. Requires mature schema validation library integration
4. Need real-world feedback on tool permission patterns first

---

## Phase 2: Content-Based Policies

### Output Validation

**Problem:**

- Tool executes successfully
- But output contains sensitive data
- Agent shouldn't see PII, secrets, etc.

**Solution: Output filtering**

```typescript
{
  toolPolicies: {
    search_documents: {
      outputValidation: (result) => {
        // Redact PII before returning to agent
        const redacted = redactPII(result.documents);
        return { allowed: true, result: redacted };
      }
    },

    read_config: {
      outputValidation: (result) => {
        // Block if output contains secrets
        if (containsSecrets(result)) {
          return {
            allowed: false,
            reason: 'Config contains secrets'
          };
        }
        return { allowed: true, result };
      }
    }
  }
}
```

---

## Phase 2: Resource Quotas

### Per-Resource Limits

**Problem:**

- Agent allowed to call `create_vm`
- But creates 1000 VMs in a loop
- Per-call cost limit isn't enough

**Solution: Resource quotas**

```typescript
{
  toolPolicies: {
    create_vm: {
      resourceQuota: {
        maxInstances: 10,  // Max 10 VMs total
        trackBy: (args) => args.vm_id  // Track by VM ID
      }
    },

    create_database: {
      resourceQuota: {
        maxInstances: 5,
        trackBy: (args) => args.db_name
      }
    }
  }
}
```

---

## Phase 3: Time-Based Policies

### Scheduled Restrictions

**Problem:**

- Agent should only run during business hours
- Or only on weekdays
- Or rate limits vary by time of day

**Solution: Time-based policies**

```typescript
{
  schedule: {
    timezone: 'America/New_York',
    allowedHours: {
      weekdays: { start: 9, end: 17 },  // 9 AM - 5 PM
      weekends: null  // Blocked on weekends
    }
  },

  toolPolicies: {
    send_email: {
      rateLimit: {
        // Higher limits during business hours
        businessHours: { maxCalls: 100, windowMs: 3600000 },
        offHours: { maxCalls: 10, windowMs: 3600000 }
      }
    }
  }
}
```

---

## Phase 3: Distributed State

### Global Per-Agent Limits

**Current (Phase 1):**

- Limits enforced per SDK instance
- Agent on 5 servers = 5x budget

**Future (Phase 3):**

- Limits enforced globally per agent ID
- Requires distributed state (Redis, etc.)

```typescript
{
  stateBackend: 'redis',
  stateConfig: {
    host: 'redis.example.com',
    port: 6379,
    keyPrefix: 'mandate:'
  }
}
```

---

## Phase 4: Delegation Chains

### Authority Inheritance

**Problem:**

- Agent A delegates to Agent B
- Agent B has more authority than A
- Delegation amplification attack

**Solution: Authority reduction**

```typescript
{
  delegation: {
    // Agent can delegate, but with reduced authority
    allowDelegation: true,
    delegationReduction: {
      maxCostTotal: 0.5,  // Delegate gets 50% of budget
      maxDepth: 2,        // Max 2 levels of delegation
      scopeReduction: 'read-only'  // Delegated agents are read-only
    }
  }
}
```

---

## Phase 5: Cryptographic Verification

### Signed Mandates

**Problem:**

- Agent claims authority from System A
- System B has no way to verify
- Cross-system trust breakdown

**Solution: Signed mandates**

```typescript
{
  mandate: {
    version: 1,
    id: 'mandate-1',
    agentId: 'agent-1',

    // Cryptographic signature
    signature: {
      algorithm: 'ed25519',
      publicKey: '0x...',
      signature: '0x...',
      issuedBy: 'org-principal-key'
    }
  }
}
```

**Verification:**

```typescript
// System B verifies mandate from System A
const isValid = await verifyMandateSignature(mandate);
if (!isValid) {
  throw new Error("Invalid mandate signature");
}
```

---

## Phase 5: Onchain Proofs (Optional)

### Immutable Audit Trail

**Problem:**

- Audit logs can be tampered with
- No cryptographic proof of enforcement
- Disputes about what actually happened

**Solution: Onchain commitments**

```typescript
{
  auditBackend: 'ethereum',
  auditConfig: {
    network: 'mainnet',
    contractAddress: '0x...',
    commitmentInterval: 3600000  // Commit every hour
  }
}
```

**What gets committed:**

- Merkle root of audit entries
- Agent ID + mandate hash
- Block timestamp

**Benefits:**

- Tamper-proof audit trail
- Publicly verifiable enforcement
- Liability attribution

---

## Contributing Ideas

Have an idea for a future feature?

1. Check if it fits into an existing phase
2. Open a GitHub Discussion to propose it
3. Explain the problem it solves
4. Provide concrete examples
5. Consider which invariant it addresses

**Remember:** Features must serve the KYA vision and solve discovered invariants, not just be "nice to have."

---

## Next Steps

See [ROADMAP.md](./ROADMAP.md) for detailed timelines and milestones.


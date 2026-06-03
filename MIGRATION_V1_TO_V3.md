# Migration Guide: Phase 1 (Standalone) → Phase 3 (Backend Integration)

## Overview

Phase 1 used hardcoded mandates. Phase 3 fetches mandates dynamically from backend.

**Breaking Changes:**
1. Constructor is now async (use factory method)
2. Config structure changed
3. Must call close() on shutdown

---

## Before (Phase 1)

```typescript
import { MandateClient } from '@mandate/sdk';

const client = new MandateClient({
  mandate: {
    id: 'mnd-123',
    agentId: 'agent-123',
    version: 1,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    allowedTools: ['web_search', 'read_file'],
    deniedTools: [],
    maxCostTotal: 10.0,
    // ...
  },
  auditLogger: {
    type: 'console'
  }
});

// Use
await client.executeTool(...);
```

---

## After (Phase 3)

```typescript
import { MandateClient } from '@mandate/sdk';

const client = await MandateClient.create({
  agentId: 'agent-123',
  apiKey: 'sk-org-abc-xxx',
  backendUrl: 'http://localhost:3000',
  context: {
    user_tier: 'free',
    environment: 'production'
  }
});

// Use (same)
await client.executeTool(...);

// Cleanup (new)
await client.close();
```

---

## Step-by-Step Migration

### 1. Start Backend

```bash
cd apps/backend
pnpm install
pnpm dev
```

### 2. Register Agent

```bash
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-123",
    "name": "My Agent",
    "principal": "dev@example.com"
  }'
```

Save the API key from response.

### 3. Create Policies

Use backend API or UI to create policies.

### 4. Update Code

**Before:**
```typescript
const client = new MandateClient({ mandate: {...} });
```

**After:**
```typescript
const client = await MandateClient.create({
  agentId: 'agent-123',
  apiKey: 'sk-org-xxx-yyy',
  backendUrl: 'http://localhost:3000',
  context: { ... }
});
```

### 5. Add Shutdown Hook

```typescript
process.on('SIGTERM', async () => {
  await client.close();
  process.exit(0);
});
```

---

## Config Mapping

| Phase 1 | Phase 3 | Notes |
|---------|---------|-------|
| `mandate.id` | Fetched from backend | Dynamic |
| `mandate.agentId` | `agentId` | Now top-level |
| `mandate.allowedTools` | Fetched from backend | Via policies |
| `mandate.maxCostTotal` | Fetched from backend | Via policies |
| `auditLogger.type` | Always backend | Automatic |
| - | `apiKey` | New (required) |
| - | `backendUrl` | New (required) |
| - | `context` | New (required) |

---

## Benefits

**Phase 1 (Hardcoded):**
- ❌ Must redeploy to change limits
- ❌ No audit trail
- ❌ No kill switch
- ❌ No multi-tenant support

**Phase 3 (Backend):**
- ✅ Update policies without redeploying
- ✅ Full audit trail
- ✅ Instant kill switch
- ✅ Multi-tenant via context
- ✅ Dynamic mandate issuance

---

## Troubleshooting

**Error: "Backend unavailable"**
→ Check backend is running at correct URL

**Error: "Invalid API key"**
→ Verify API key from agent registration

**Error: "Agent not found"**
→ Register agent first

**Error: "No policy matched"**
→ Create policy rules in backend


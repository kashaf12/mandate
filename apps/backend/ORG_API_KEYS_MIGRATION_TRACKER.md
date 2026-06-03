# Organization-Level API Keys Migration Tracker

**Status:** 🟡 In Progress  
**Started:** 2024-12-30  
**Target Completion:** TBD

## Overview

Migrating from per-agent API keys to organization-level API keys (multi-tenant SaaS pattern). This decouples agent identity from authentication, enabling key rotation without changing agent identity.

### Current State (Broken)

- Agents table has `apiKeyHash` field
- Each agent has its own API key
- Key rotation requires creating new agent

### Target State (Correct)

- Organizations table (root tenant boundary)
- API keys table (org-scoped, multiple keys per org)
- Agents table has `orgId` (no `apiKeyHash`)
- Audit logs have `orgId` (tenant isolation)

---

## Phase 1: Database Schemas (Foundation)

### 1.1 Create Organizations Schema

- **File:** `src/database/schemas/organizations.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create organizations table schema
  - [ ] Add indexes (orgId)
  - [ ] Export TypeScript types
- **Notes:** Root tenant boundary table

### 1.2 Create API Keys Schema

- **File:** `src/database/schemas/api-keys.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create api_keys table schema
  - [ ] Add fields: keyId, orgId, keyHash, name, status, createdAt, createdBy, revokedAt, expiresAt
  - [ ] Add indexes (orgId, keyHash, status, compound orgId+status)
  - [ ] Export TypeScript types
- **Notes:** Supports key rotation with grace period

### 1.3 Update Agents Schema

- **File:** `src/database/schemas/agents.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Remove `apiKeyHash` field
  - [ ] Remove `idx_agents_api_key_hash` index
  - [ ] Add `orgId` field (VARCHAR(64), NOT NULL)
  - [ ] Add `idx_agents_org_id` index
  - [ ] Add `idx_agents_org_status` compound index
  - [ ] Update TypeScript types
- **Notes:** Agent identity decoupled from authentication

### 1.4 Update Audit Logs Schema

- **File:** `src/database/schemas/audit-logs.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Add `orgId` field (VARCHAR(64), NOT NULL)
  - [ ] Add `idx_audit_org_id` index
  - [ ] Add `idx_audit_org_agent` compound index
  - [ ] Update TypeScript types
- **Notes:** Enables tenant isolation in audit queries

### 1.5 Update Database Schema Exports

- **File:** `src/database/schema.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Export `organizations` schema
  - [ ] Export `api-keys` schema
- **Notes:** Ensure all schemas are accessible

---

## Phase 2: Utilities & Services (Business Logic)

### 2.1 Update Crypto Utils

- **File:** `src/common/utils/crypto.utils.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Add `generateOrgId()` function
  - [ ] Add `generateKeyId()` function
  - [ ] Add `generateOrgApiKey(orgId)` function
  - [ ] Add `validateApiKeyFormat(apiKey)` function
  - [ ] Deprecate `generateApiKey()` (throw error)
  - [ ] Keep existing functions (generateAgentId, hashApiKey, etc.)
- **Notes:** New API key format: `sk-{orgId}-{random32}`

### 2.2 Create Organizations Service

- **File:** `src/organizations/organizations.service.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create OrganizationsService class
  - [ ] Implement `create(name)` method
  - [ ] Implement `findByOrgId(orgId)` method
  - [ ] Implement `findAll()` method
  - [ ] Implement `update(orgId, name)` method
  - [ ] Add error handling and logging
- **Notes:** Basic CRUD operations for organizations

### 2.3 Create API Keys Service

- **File:** `src/api-keys/api-keys.service.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create ApiKeysService class
  - [ ] Implement `create(orgId, name?, createdBy?)` method
  - [ ] Implement `findByApiKey(apiKey)` method (authentication)
  - [ ] Implement `revoke(keyId)` method
  - [ ] Implement `listForOrg(orgId)` method
  - [ ] Implement `rotate(oldKeyId, gracePeriodDays?, createdBy?)` method
  - [ ] Add validation (format, status, expiry)
  - [ ] Add error handling and logging
- **Notes:** Core authentication logic - CRITICAL

### 2.4 Update Agents Service

- **File:** `src/agents/agents.service.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Remove `apiKey` generation from `create()`
  - [ ] Remove `apiKey` from return type
  - [ ] Add `orgId` parameter to `create(orgId, createAgentDto)`
  - [ ] Add `orgId` field to agent insert
  - [ ] Remove `findByApiKey()` method (moved to ApiKeysService)
  - [ ] Add OrganizationsService dependency
  - [ ] Update `logKillSwitch()` to get orgId from agent
  - [ ] Update `logResurrect()` to get orgId from agent
- **Notes:** Agent creation no longer returns API key

### 2.5 Update Audit Service

- **File:** `src/audit/audit.service.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Add `orgId` parameter to `create(orgId, dto)` method
  - [ ] Add `orgId` parameter to `bulkCreate(orgId, dtos)` method
  - [ ] Add `orgId` field to audit log inserts
  - [ ] Update `logKillSwitch()` to get orgId from agent
  - [ ] Update `logResurrect()` to get orgId from agent
- **Notes:** All audit logs must include orgId for tenant isolation

---

## Phase 3: Controllers & Guards (API Layer)

### 3.1 Update API Key Guard

- **File:** `src/common/guards/api-key.guard.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Complete rewrite for org-level authentication
  - [ ] Extract API key from Authorization header
  - [ ] Validate format using `validateApiKeyFormat()`
  - [ ] Authenticate using `ApiKeysService.findByApiKey()`
  - [ ] Attach `org` context to request (`request.org.orgId`)
  - [ ] If agentId present: validate agent belongs to org
  - [ ] Attach `agent` context to request if validated
  - [ ] Block cross-org access attempts
  - [ ] Update error handling
- **Notes:** CRITICAL - This is the authentication layer

### 3.2 Create Organizations Controller

- **File:** `src/organizations/organizations.controller.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create OrganizationsController class
  - [ ] Implement `POST /organizations` (create)
  - [ ] Implement `GET /organizations` (list all - admin)
  - [ ] Implement `GET /organizations/:orgId` (get one)
  - [ ] Implement `PATCH /organizations/:orgId` (update name)
  - [ ] Add Swagger documentation
  - [ ] Add `@UseGuards(ApiKeyGuard)` where needed
- **Notes:** Basic org management endpoints

### 3.3 Create API Keys Controller

- **File:** `src/api-keys/api-keys.controller.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create ApiKeysController class
  - [ ] Implement `POST /organizations/:orgId/api-keys` (create)
  - [ ] Implement `GET /organizations/:orgId/api-keys` (list)
  - [ ] Implement `DELETE /organizations/:orgId/api-keys/:keyId` (revoke)
  - [ ] Implement `POST /organizations/:orgId/api-keys/:keyId/rotate` (rotate)
  - [ ] Add Swagger documentation
  - [ ] Add `@UseGuards(ApiKeyGuard)` to protected endpoints
  - [ ] Never expose keyHash in responses
- **Notes:** Key management endpoints

### 3.4 Update Agents Controller

- **File:** `src/agents/agents.controller.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Add `@UseGuards(ApiKeyGuard)` to `create()` endpoint
  - [ ] Extract `orgId` from `request.org.orgId` in `create()`
  - [ ] Pass `orgId` to `agentsService.create(orgId, dto)`
  - [ ] Remove `apiKey` from response
  - [ ] Add `@UseGuards(ApiKeyGuard)` to other protected endpoints
  - [ ] Add `@ApiBearerAuth()` to Swagger docs
  - [ ] Update response DTOs (see Phase 4)
- **Notes:** All agent endpoints now require org API key

### 3.5 Update Audit Controller

- **File:** `src/audit/audit.controller.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Extract `orgId` from `request.org.orgId` in `create()`
  - [ ] Extract `orgId` from `request.org.orgId` in `bulkCreate()`
  - [ ] Pass `orgId` to `auditService.create(orgId, dto)`
  - [ ] Pass `orgId` to `auditService.bulkCreate(orgId, dto)`
  - [ ] Ensure `@UseGuards(ApiKeyGuard)` is present
- **Notes:** Audit logs now scoped to organization

---

## Phase 4: DTOs & Modules (Integration)

### 4.1 Update Agent Response DTO

- **File:** `src/agents/dto/agent-response.dto.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Add `orgId` field with `@ApiProperty()`
  - [ ] Remove any `apiKey` references (if present)
  - [ ] Update `fromEntity()` to include `orgId`
- **Notes:** Response DTO must match new schema

### 4.2 Create Organizations Module

- **File:** `src/organizations/organizations.module.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create OrganizationsModule class
  - [ ] Import DatabaseModule
  - [ ] Import LoggerModule
  - [ ] Register OrganizationsService
  - [ ] Register OrganizationsController
  - [ ] Export OrganizationsService
- **Notes:** Standard NestJS module setup

### 4.3 Create API Keys Module

- **File:** `src/api-keys/api-keys.module.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create ApiKeysModule class
  - [ ] Import DatabaseModule
  - [ ] Import OrganizationsModule
  - [ ] Import LoggerModule
  - [ ] Register ApiKeysService
  - [ ] Register ApiKeysController
  - [ ] Export ApiKeysService (for guards)
- **Notes:** Must export ApiKeysService for ApiKeyGuard

### 4.4 Update Agents Module

- **File:** `src/agents/agents.module.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Import OrganizationsModule
  - [ ] Import ApiKeysModule
  - [ ] Ensure proper module order
- **Notes:** AgentsModule depends on OrganizationsModule

### 4.5 Update App Module

- **File:** `src/app.module.ts`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Import OrganizationsModule
  - [ ] Import ApiKeysModule
  - [ ] Ensure module order (OrganizationsModule before AgentsModule)
  - [ ] Ensure module order (ApiKeysModule before AgentsModule)
- **Notes:** Module dependency order matters

---

## Phase 5: Migration & Testing

### 5.1 Create Drizzle Migration

- **File:** `drizzle/XXXX_org_level_api_keys.sql`
- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Create organizations table
  - [ ] Create api_keys table
  - [ ] Add orgId to agents table (nullable first)
  - [ ] Add orgId to audit_logs table (nullable first)
  - [ ] Create default organization (`org-default`)
  - [ ] Migrate existing agents to default org
  - [ ] Migrate existing audit logs to default org
  - [ ] Make orgId NOT NULL
  - [ ] Create indexes
  - [ ] Drop apiKeyHash from agents
  - [ ] Drop old apiKeyHash index
- **Notes:** Migration must handle existing data

### 5.2 Run Migration

- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Generate Drizzle migration (or create SQL manually)
  - [ ] Review migration SQL
  - [ ] Backup database (if needed)
  - [ ] Run migration: `npm run db:migrate`
  - [ ] Verify tables created: `psql $DATABASE_URL -c "\dt"`
  - [ ] Verify indexes created
  - [ ] Verify default org exists
- **Notes:** Test migration on dev database first

### 5.3 Update Tests

- **Status:** ⬜ Not Started
- **Files to Update:**
  - [ ] `src/agents/agents.service.spec.ts`
  - [ ] `src/agents/agents.controller.spec.ts`
  - [ ] `src/common/guards/api-key.guard.spec.ts`
  - [ ] `src/organizations/organizations.service.spec.ts` (new)
  - [ ] `src/api-keys/api-keys.service.spec.ts` (new)
- **Tasks:**
  - [ ] Mock OrganizationsService in agent tests
  - [ ] Mock ApiKeysService in guard tests
  - [ ] Remove `apiKey` from agent create test assertions
  - [ ] Add `orgId` to agent test assertions
  - [ ] Update ApiKeyGuard tests for org-level auth
  - [ ] Add tests for OrganizationsService
  - [ ] Add tests for ApiKeysService
  - [ ] Add tests for cross-org access blocking
  - [ ] Add tests for key rotation
- **Notes:** All tests must pass before deployment

### 5.4 Integration Testing

- **Status:** ⬜ Not Started
- **Tasks:**
  - [ ] Test: Create organization
  - [ ] Test: Create API key for org
  - [ ] Test: Create agent with org API key
  - [ ] Test: Get agent (validates org membership)
  - [ ] Test: Cross-org access blocked (401)
  - [ ] Test: Key rotation (grace period)
  - [ ] Test: Revoke key
  - [ ] Test: Revoked key rejected
  - [ ] Test: Expired key rejected
  - [ ] Test: Audit logs include orgId
- **Notes:** Manual testing with curl/Postman

---

## Verification Checklist

### Database

- [ ] `organizations` table exists with correct schema
- [ ] `api_keys` table exists with correct schema
- [ ] `agents` table has `orgId` field (no `apiKeyHash`)
- [ ] `audit_logs` table has `orgId` field
- [ ] All indexes created successfully
- [ ] Default org `org-default` exists

### Code

- [ ] `generateOrgApiKey()` function works
- [ ] `validateApiKeyFormat()` function works
- [ ] `OrganizationsService` compiles
- [ ] `ApiKeysService` compiles
- [ ] `AgentsService` updated (no `findByApiKey`, has `orgId` param)
- [ ] `ApiKeyGuard` rewritten (org-level auth)
- [ ] All controllers updated
- [ ] All DTOs updated (no apiKey, has orgId)
- [ ] All modules imported correctly

### API Endpoints

- [ ] `POST /organizations` creates org
- [ ] `POST /organizations/:orgId/api-keys` creates key
- [ ] `GET /organizations/:orgId/api-keys` lists keys
- [ ] `DELETE /organizations/:orgId/api-keys/:keyId` revokes key
- [ ] `POST /organizations/:orgId/api-keys/:keyId/rotate` rotates key
- [ ] `POST /agents` creates agent (with org API key)
- [ ] `GET /agents/:agentId` returns agent with orgId
- [ ] ApiKeyGuard blocks cross-org access
- [ ] ApiKeyGuard validates agent belongs to org

### Security

- [ ] API key format validated (sk-org-xxx-yyy)
- [ ] Key hash stored (not plaintext)
- [ ] Agent-org membership validated
- [ ] Cross-org access blocked
- [ ] Revoked keys rejected
- [ ] Expired keys rejected

### Tests

- [ ] All tests updated
- [ ] All tests pass
- [ ] Integration tests added

---

## Success Metrics

- [ ] Agents created without API keys (no apiKey in create response)
- [ ] Org API keys work for all org agents (multiple agents share one key)
- [ ] Key rotation works (grace period, both keys valid)
- [ ] Cross-org access blocked (401 when using wrong org key)
- [ ] Kill switch still works (with org API key)
- [ ] Audit logs include orgId (tenant isolation)

---

## Blockers & Notes

### Current Blockers

- None

### Notes

- No backward compatibility needed (no production users)
- Migration creates default org for existing data
- All existing agents will be assigned to `org-default`
- API key format: `sk-{orgId}-{random32}`

---

## Progress Summary

**Phase 1 (Database Schemas):** 0/5 tasks completed  
**Phase 2 (Utilities & Services):** 0/5 tasks completed  
**Phase 3 (Controllers & Guards):** 0/5 tasks completed  
**Phase 4 (DTOs & Modules):** 0/5 tasks completed  
**Phase 5 (Migration & Testing):** 0/4 tasks completed

**Overall Progress:** 0/24 major tasks completed (0%)

---

## Next Steps

1. Start with Phase 1: Database Schemas
2. Test each phase before moving to next
3. Update this tracker as work progresses
4. Mark tasks as complete when done
5. Add blockers/notes as needed

---

## Reference

- **Architecture:** Organization-level authentication pattern (AWS IAM, Stripe, Auth0)
- **API Key Format:** `sk-{orgId}-{random32}`
- **Security Model:** Org-level auth + policy-based authz
- **Migration Strategy:** Create default org, migrate existing data

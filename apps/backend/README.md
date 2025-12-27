# Mandate Backend (Phase 2)

NestJS + PostgreSQL + Drizzle backend for dynamic policy-driven mandate issuance. This is the API service that manages agents, policies, rules, and mandates for AI agent authority enforcement.

## Overview

The Mandate Backend provides a RESTful API for:

- **Agent Management** - Register and manage AI agents with API key authentication
- **Policy Management** - Create and version policies that define authority limits
- **Rule Management** - Define context-matching rules that map to policies
- **Mandate Issuance** - Dynamically issue runtime authority based on context
- **Audit Logging** - Track all enforcement decisions and actions
- **Health Monitoring** - Service and database health checks

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Docker & Docker Compose
- PostgreSQL 16+ (via Docker)

### Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start PostgreSQL:**

   ```bash
   # Production (no pgAdmin)
   docker-compose up -d

   # Development (with pgAdmin)
   docker-compose -f docker-compose.dev.yml up -d
   ```

3. **Create .env file:**

   ```bash
   cp .env.example .env
   ```

   Required environment variables:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mandate
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=<generate-random-32-char-string>
   API_KEY_SALT=<generate-random-32-char-string>
   LOG_LEVEL=info
   ```

4. **Run migrations:**

   ```bash
   pnpm db:migrate
   ```

5. **Start development server:**

   ```bash
   pnpm start:dev
   ```

   Server runs on `http://localhost:3000`
   Swagger docs available at `http://localhost:3000/api`

## Architecture

### Core Flow

```
Context → Rules → Policies → Mandate
```

1. **Context** - Input data (agent, environment, user_tier, etc.)
2. **Rules** - Conditions that match context to policies
3. **Policies** - Authority templates (versioned, immutable)
4. **Mandate** - Issued runtime authority envelope (valid for 5 minutes)

### Components

#### Modules

- **AgentsModule** - Agent registration and lifecycle management
- **PoliciesModule** - Policy CRUD with versioning
- **RulesModule** - Rule CRUD with context matching
- **MandatesModule** - Mandate issuance and retrieval
- **AuditModule** - Audit log creation and querying
- **HealthModule** - Service health indicators
- **DatabaseModule** - PostgreSQL connection (global)
- **LoggerModule** - Winston logging (global)

#### Services

- **AgentsService** - Agent management, kill switch, resurrection
- **PoliciesService** - Policy CRUD with transaction-based versioning
- **RulesService** - Rule CRUD and validation
- **RuleEvaluatorService** - Context-to-policy matching engine
- **PolicyComposerService** - Policy composition (MIN budgets, INTERSECTION allowed tools)
- **MandatesService** - Mandate issuance with rule evaluation
- **AuditService** - Audit log persistence and querying
- **DatabaseService** - Transaction wrapper for complex operations

#### Guards & Middleware

- **ApiKeyGuard** - Bearer token authentication (validates API keys)
- **RequestIdMiddleware** - Adds unique request ID for correlation

## API Endpoints

### Agents API (`/agents`)

**Authentication:** None (public endpoints)

- `POST /agents` - Create agent (returns API key)
- `GET /agents` - List all agents
- `GET /agents/:agentId` - Get agent by ID
- `PUT /agents/:agentId` - Update agent
- `DELETE /agents/:agentId` - Soft delete agent
- `POST /agents/:agentId/kill` - Kill agent (requires API key, self-service only)
- `GET /agents/:agentId/kill-status` - Get kill switch status (requires API key)
- `POST /agents/:agentId/resurrect` - Resurrect killed agent (requires API key, self-service only)

**Features:**

- API keys are hashed with SHA-256 before storage
- API keys returned only once on creation
- Kill switch prevents mandate issuance
- Self-service kill/resurrect (agents can only manage themselves)

### Policies API (`/policies`)

**Authentication:** None (public endpoints)

- `POST /policies` - Create policy (version 1)
- `GET /policies` - List all policies (optional `?active=true` filter)
- `GET /policies/:policyId` - Get policy (latest or `?version=X`)
- `PUT /policies/:policyId` - Update policy (creates new immutable version)
- `DELETE /policies/:policyId` - Archive policy (soft delete, optional `?version=X`)

**Features:**

- Immutable versioning (each update creates new version)
- Transaction-based versioning prevents race conditions
- Row-level locking (`FOR UPDATE`) ensures atomic updates

### Rules API (`/rules`)

**Authentication:** None (public endpoints)

- `POST /rules` - Create rule
- `GET /rules` - List all rules (optional `?active=true` filter)
- `GET /rules/:ruleId` - Get rule by ID
- `PUT /rules/:ruleId` - Update rule
- `DELETE /rules/:ruleId` - Delete rule

**Features:**

- Priority-based evaluation order
- Agent scoping (universal or agent-specific)
- Context matching with AND/OR logic
- Comparison operators: `==`, `!=`, `in`, `contains`, `>`, `<`, `>=`, `<=`

### Mandates API (`/mandates`)

**Authentication:** Required (API key via `ApiKeyGuard`)

- `POST /mandates/issue` - Issue mandate for authenticated agent
- `GET /mandates/:mandateId` - Get mandate details (ownership verified)

**Features:**

- Agent identified from API key
- Context-based rule evaluation
- Policy composition (multiple policies merged)
- 5-minute expiration
- Ownership verification (agents can only access their own mandates)

### Audit API (`/audit`)

**Authentication:** Required (API key via `ApiKeyGuard`)

- `POST /audit` - Create single audit log entry
- `POST /audit/bulk` - Bulk insert audit logs (for SDK batch reporting)
- `GET /audit` - Query audit logs with filters

**Query Parameters:**

- `agentId` - Filter by agent (auto-applied from API key)
- `decision` - `ALLOW` or `BLOCK`
- `actionType` - Type of action (e.g., `tool_call`, `llm_call`)
- `from` - Start timestamp (ISO 8601)
- `to` - End timestamp (ISO 8601)
- `limit` - Max results (default: 100, max: 1000)
- `offset` - Pagination offset

**Features:**

- Automatic agent ID injection (prevents spoofing)
- Cross-agent access prevention (agents only see their own logs)
- Optimized queries with composite indexes

### Health API (`/health`)

**Authentication:** None (public endpoint)

- `GET /health` - Health check with database pool metrics

**Response:**

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "pool": {
        "total": 5,
        "idle": 3,
        "waiting": 0
      },
      "maxConnections": 20
    }
  }
}
```

## Database Schema

### Tables

- **agents** - Agent registry with API key hashes
- **policies** - Versioned policy definitions
- **rules** - Context-matching rules with priority
- **mandates** - Issued runtime authority (expires after 5 minutes)
- **audit_logs** - Enforcement decision trail
- **kill_switches** - Emergency agent termination records

### Indexes

**Audit Logs:**

- `idx_audit_action_type` - Single column (actionType)
- `idx_audit_agent_decision_time` - Composite (agentId, decision, timestamp)
- `idx_audit_action_type_time` - Composite (actionType, timestamp)

**Policies:**

- `idx_policies_policy_id` - Policy ID lookup
- `unique_policy_version` - Unique constraint (policyId, version)

**Rules:**

- `idx_rules_policy_id` - Policy ID foreign key
- `idx_rules_active` - Active status filter
- `unique_rule_version` - Unique constraint (ruleId, version)

## Security Features

### API Key Authentication

- **Format:** `Bearer sk-{32-char-random-string}`
- **Storage:** SHA-256 hashed (never stored in plaintext)
- **Validation:** `ApiKeyGuard` validates on every authenticated request
- **Scope:** Agent can only access its own data

### Authorization

- **Self-Service Actions:**
  - Agents can only kill/resurrect themselves
  - Agents can only view their own mandates
  - Agents can only query their own audit logs

- **Tenant Isolation:**
  - Mandate retrieval enforces ownership
  - Audit logs filtered by authenticated agent
  - Cross-agent data access blocked

### Input Validation

- **Context Sanitization:**
  - Keys: Alphanumeric + underscore/hyphen only
  - Values: String type, max 1000 chars
  - Dangerous characters blocked: `<>'";\\`

- **Glob Pattern Validation:**
  - Tool patterns validated before regex compilation
  - Max length: 100 characters
  - Allowed: Alphanumeric + `*`, `_`, `-`, `.`

- **Operator Validation:**
  - Rule operators validated against allowed set
  - Prevents arbitrary operator injection

## Key Features

### Policy Versioning

- Immutable versions (updates create new version)
- Transaction-based with row-level locking
- Prevents race conditions in concurrent updates
- Version history preserved for audit

### Rule Evaluation

- Priority-based matching order
- AND/OR logic for conditions
- Agent scoping (universal or specific)
- Fail-closed when no rules match

### Policy Composition

When multiple policies match:

- **Budgets:** MIN (most restrictive)
- **Allowed Tools:** INTERSECTION (must be in all)
- **Denied Tools:** UNION (any denial blocks)
- **Tool Policies:** Merged with conflict resolution

### Error Handling

- Structured Winston logging in all catch blocks
- Request ID tracing for correlation
- Safe error serialization (handles non-Error objects)
- Detailed error context in logs

### Observability

- **Request ID Middleware:** Unique ID per request (correlation)
- **Winston Logging:** Structured JSON logs
- **Health Checks:** Database pool metrics
- **Audit Trail:** Complete decision history

## Project Structure

```
apps/backend/
├── src/
│   ├── main.ts                      # Application entry, Swagger setup
│   ├── app.module.ts                # Root module
│   ├── agents/                      # Agent management
│   │   ├── agents.controller.ts
│   │   ├── agents.service.ts
│   │   └── dto/
│   ├── policies/                    # Policy CRUD
│   │   ├── policies.controller.ts
│   │   ├── policies.service.ts
│   │   └── dto/
│   ├── rules/                       # Rule management
│   │   ├── rules.controller.ts
│   │   ├── rules.service.ts
│   │   ├── rule-evaluator.service.ts
│   │   ├── policy-composer.service.ts
│   │   └── dto/
│   ├── mandates/                    # Mandate issuance
│   │   ├── mandates.controller.ts
│   │   ├── mandates.service.ts
│   │   └── dto/
│   ├── audit/                       # Audit logging
│   │   ├── audit.controller.ts
│   │   ├── audit.service.ts
│   │   └── dto/
│   ├── health/                      # Health checks
│   │   ├── health.controller.ts
│   │   └── database.health.ts
│   ├── database/                    # Database layer
│   │   ├── database.module.ts
│   │   ├── database.service.ts
│   │   ├── schema.ts
│   │   └── schemas/                 # Table definitions
│   ├── common/                      # Shared utilities
│   │   ├── guards/
│   │   │   └── api-key.guard.ts
│   │   ├── middleware/
│   │   │   └── request-id.middleware.ts
│   │   ├── utils/
│   │   │   ├── crypto.utils.ts
│   │   │   └── error.utils.ts
│   │   └── logger/
│   │       └── logger.module.ts
│   └── config/
│       └── env.validation.ts
├── drizzle/                         # Migration files
├── test/                            # E2E tests
├── docker-compose.yml               # PostgreSQL (production)
├── docker-compose.dev.yml           # PostgreSQL + pgAdmin
├── Dockerfile                       # NestJS app container
├── drizzle.config.ts                # Drizzle configuration
├── jest.config.js                   # Test configuration
├── tsconfig.json                    # TypeScript config
└── package.json
```

## Available Scripts

- `pnpm start` - Start production server
- `pnpm start:dev` - Start development server with watch mode
- `pnpm build` - Build for production
- `pnpm test` - Run unit tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:cov` - Run tests with coverage
- `pnpm test:e2e` - Run end-to-end tests
- `pnpm db:generate` - Generate Drizzle migrations
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Drizzle Studio (database UI)
- `pnpm lint` - Run ESLint

## Testing

### Test Coverage

- **182 tests** across all modules
- Unit tests for all services
- Controller tests with mocked dependencies
- Integration tests for critical flows

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:cov

# Specific test file
pnpm test agents.service.spec.ts
```

### Test Utilities

- Winston logger mocks in all service tests
- Database connection mocks with Drizzle ORM method chaining
- API key guard mocks for controller tests
- Request ID middleware testing

## Database

### Connection

PostgreSQL 16 running in Docker. Access via:

- **Connection String:** `postgresql://postgres:postgres@localhost:5432/mandate` (or from .env)
- **pgAdmin (dev only):** http://localhost:5050
  - Email: `admin@mandate.local`
  - Password: `admin`

### Migrations

Migrations are managed with Drizzle Kit:

```bash
# Generate migration from schema changes
pnpm db:generate

# Run migrations
pnpm db:migrate

# Open Drizzle Studio (visual DB browser)
pnpm db:studio
```

### Connection Pool

- **Max Connections:** 20
- **Idle Timeout:** 30 seconds
- **Connection Timeout:** 2 seconds
- **Pool Metrics:** Exposed via health check

## Docker

### Development

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Includes:

- PostgreSQL 16
- pgAdmin (database management UI)

### Production

```bash
docker-compose up -d
```

PostgreSQL only (no pgAdmin).

### Build and Run NestJS App

```bash
# Build image
docker build -t mandate-backend .

# Run container
docker run -p 3000:3000 \
  --env-file .env \
  --network mandate-db_default \
  mandate-backend
```

## Development

### Environment Variables

Required variables (see `.env.example`):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mandate
PORT=3000
NODE_ENV=development
JWT_SECRET=<32-char-minimum-secret>
API_KEY_SALT=<32-char-minimum-salt>
LOG_LEVEL=info
```

### Code Quality

- **TypeScript:** Strict mode enabled
- **ESLint:** Configured with Prettier
- **Validation:** Class-validator for DTOs
- **Error Handling:** Consistent error utilities

### Common Patterns

#### Error Logging

All services use Winston logger with structured error info:

```typescript
import { extractErrorInfo } from '../common/utils/error.utils';

try {
  // ...
} catch (error) {
  const { message, stack } = extractErrorInfo(error);
  this.logger.error('Operation failed', {
    error: message,
    stack,
    context: {
      /* relevant data */
    },
  });
  throw error;
}
```

#### Request Correlation

Request ID middleware automatically adds `x-request-id` header to all requests for log correlation.

#### Transaction Safety

Database operations use transactions and row-level locking:

```typescript
await this.db.transaction(async (tx) => {
  const [policy] = await tx
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.policyId, policyId))
    .orderBy(desc(schema.policies.version))
    .limit(1)
    .for('update'); // Row-level lock

  // ... create new version
});
```

## API Examples

See [REQUESTS.md](./REQUESTS.md) for complete curl examples for all endpoints.

### Create Agent

```bash
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agent",
    "principal": "user@example.com",
    "environment": "production"
  }'
```

### Issue Mandate

```bash
curl -X POST http://localhost:3000/mandates/issue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key-here" \
  -d '{
    "context": {
      "user_tier": "free",
      "environment": "production"
    }
  }'
```

### Query Audit Logs

```bash
curl -X GET "http://localhost:3000/audit?decision=ALLOW&limit=10" \
  -H "Authorization: Bearer sk-your-api-key-here"
```

## Swagger Documentation

Interactive API documentation available at:

**http://localhost:3000/api**

Features:

- All endpoints documented
- Request/response schemas
- Try-it-out functionality
- Authentication support (Bearer token)

## Production Considerations

### Security

- ✅ API keys hashed (SHA-256)
- ✅ Input validation and sanitization
- ✅ Tenant isolation enforced
- ✅ Self-service authorization checks
- ✅ SQL injection prevention (Drizzle ORM)
- ✅ XSS prevention (context sanitization)

### Performance

- ✅ Database indexes on common queries
- ✅ Connection pooling (20 max connections)
- ✅ Query optimization with composite indexes
- ✅ Transaction-based updates (prevents race conditions)

### Observability

- ✅ Structured logging (Winston)
- ✅ Request ID correlation
- ✅ Health checks with pool metrics
- ✅ Audit trail for all decisions

### Scalability

- ✅ Stateless API (except database)
- ✅ Horizontal scaling ready
- ✅ Connection pooling limits per instance
- ⚠️ Consider Redis for distributed state (Phase 3)

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Migration Issues

```bash
# Check migration status
pnpm db:studio

# Rollback (manual) - drop and recreate tables
# Note: This will lose data!
docker-compose down -v
docker-compose up -d
pnpm db:migrate
```

### Test Failures

Ensure all dependencies are installed:

```bash
pnpm install
```

Check that Winston logger is properly mocked in test files.

## Related Documentation

- [Main README](../../README.md) - SDK overview and Phase roadmap
- [REQUESTS.md](./REQUESTS.md) - Complete API request examples
- [VISION.md](../../docs/VISION.md) - Know Your Agent vision
- [AUTHORITY_MODEL_v1.md](../../docs/AUTHORITY_MODEL_v1.md) - Authority types

## License

MIT License - see [LICENSE](../../LICENSE) for details.

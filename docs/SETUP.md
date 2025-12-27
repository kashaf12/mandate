# Mandate SDK - Local Development Setup

**Complete guide for setting up Mandate SDK for local development and testing.**

---

## Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **pnpm** 8+ ([Install](https://pnpm.io/installation))
- **Docker** & **Docker Compose** ([Install](https://docs.docker.com/get-docker/))

**Verify installation:**

```bash
node --version  # Should be 18+
pnpm --version  # Should be 8+
docker --version
docker compose version
```

---

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/kashaf12/mandate.git
cd mandate
pnpm install
```

### 2. Start Docker Services

**Start Redis (required for Phase 3 features and integration tests):**

```bash
# From project root
pnpm docker:start

# Or manually
cd packages/sdk
docker compose up -d
```

**Verify Redis is running:**

```bash
docker ps | grep redis
# Should show: mandate-redis or similar

# Test connection
docker exec -it $(docker ps -q -f name=redis) redis-cli ping
# Should return: PONG
```

**Start PostgreSQL (required for Phase 2 Backend API):**

```bash
# From project root
cd apps/backend
docker-compose -f docker-compose.dev.yml up -d

# Verify PostgreSQL is running
docker ps | grep postgres
# Should show: mandate-backend-postgres or similar

# Test connection (optional)
docker exec -it $(docker ps -q -f name=postgres) psql -U postgres -d mandate -c "SELECT 1"
# Should return: 1
```

### 3. Build SDK

```bash
pnpm build
```

### 4. Run Tests

```bash
# All tests (requires Redis for integration tests)
pnpm test

# Unit tests only (no Redis needed)
pnpm --filter @mandate/sdk test -- tests/state/memory.test.ts

# Integration tests (requires Redis)
pnpm --filter @mandate/sdk test:integration
```

### 5. Run Examples

```bash
# Basic examples (no Redis/LLM needed)
pnpm --filter @mandate/examples run example:tool-permissions

# Phase 3 examples (requires Redis)
pnpm docker:start  # Make sure Redis is running
pnpm --filter @mandate/examples run example:phase3-budget

# LLM examples (requires OpenAI API key or local LLM)
export OPENAI_API_KEY=your-key-here
pnpm --filter @mandate/examples run example:email-simple
```

---

## Docker Services

### Redis (Required for Phase 3)

**Start:**

```bash
pnpm docker:start
```

**Stop:**

```bash
pnpm docker:stop
```

**View logs:**

```bash
pnpm docker:logs
```

**Check status:**

```bash
docker ps | grep redis
```

**Configuration:**

- **Port:** `6379`
- **Data persistence:** Enabled (AOF)
- **Volume:** `redis-data` (persists across restarts)

**File location:** `packages/sdk/docker-compose.yml`

---

## Redis Data Management

### Viewing Redis Data with Redis Insight

**Redis Insight** is a GUI tool for viewing and managing Redis data locally.

**Start Redis Insight:**

```bash
docker run -d \
  --name redisinsight \
  -p 5540:5540 \
  redis/redisinsight:latest
```

**Access Redis Insight:**

1. Open browser: `http://localhost:5540`
2. Click "Add Redis Database"
3. Enter connection details:
   - **Host:** `host.docker.internal`
   - **Port:** `6379`
   - **Database Alias:** `Mandate Local` (optional)
4. Click "Add Redis Database"

**Connection string format:**

```
redis://host.docker.internal:6379
```

**Stop Redis Insight:**

```bash
docker stop redisinsight
docker rm redisinsight
```

### Cleaning Up Redis Data

**⚠️ WARNING:** All cleanup operations are **irreversible**. Use with caution.

#### Option 1: Flush Everything (Fastest, Most Destructive)

**For local/dev environments only.**

**Using Redis Insight:**

1. Open your database in Redis Insight
2. Open CLI (bottom panel)
3. Run:

```redis
FLUSHALL
```

**Or flush only current database:**

```redis
FLUSHDB
```

**Using redis-cli:**

```bash
# Connect to Redis
docker exec -it $(docker ps -q -f name=redis) redis-cli

# Flush all databases
FLUSHALL

# Or flush current database only
FLUSHDB
```

**⚠️ This deletes ALL data instantly and irreversibly.**

#### Option 2: Delete by Key Pattern (Recommended)

**Use this when you know your key prefixes and want to avoid collateral damage.**

**Mandate SDK keys typically use prefixes like:**

- `mandate:state:*` - Agent state
- `mandate:kill:*` - Kill switch state
- `mandate:budget:*` - Budget tracking

**Using redis-cli (SAFE method with SCAN):**

```bash
# Connect to Redis
docker exec -it $(docker ps -q -f name=redis) redis-cli

# Scan and delete mandate keys (safe, non-blocking)
redis-cli --scan --pattern "mandate:*" | xargs redis-cli DEL
```

**Or delete specific prefix:**

```bash
# Delete all state keys
redis-cli --scan --pattern "mandate:state:*" | xargs redis-cli DEL

# Delete all kill switch keys
redis-cli --scan --pattern "mandate:kill:*" | xargs redis-cli DEL
```

**⚠️ Do NOT use `KEYS` command:**

```redis
KEYS mandate:*  # ❌ BLOCKING - dangerous in production
```

**Using Redis Insight:**

1. Open Keys Browser
2. Filter by prefix (e.g., `mandate:`)
3. Select all matching keys
4. Click Delete

**Good for small datasets, slow for millions of keys.**

#### Option 3: TTL-Based Cleanup (Long-Term Solution)

**If Redis keeps getting bloated, set TTLs on keys.**

**Check if key has TTL:**

```bash
docker exec -it $(docker ps -q -f name=redis) redis-cli TTL "mandate:state:agent-1"
```

**Result meanings:**

- `-1` = No expiration (lives forever) → **bad design**
- `-2` = Key doesn't exist
- `> 0` = Seconds until expiration → **good**

**Set TTL on existing keys:**

```bash
# Set 1 hour expiration
docker exec -it $(docker ps -q -f name=redis) redis-cli EXPIRE "mandate:state:agent-1" 3600
```

**Note:** Mandate SDK keys don't expire by default. Add TTL if you need automatic cleanup.

#### Option 4: Reset Docker Volume (Hard Reset)

**Complete wipe of Redis data (Docker only):**

```bash
# Stop Redis
pnpm docker:stop

# Remove volume (deletes all data)
docker volume rm $(docker volume ls -q | grep redis)

# Or if using docker-compose
cd packages/sdk
docker compose down -v  # -v removes volumes

# Restart Redis (fresh start)
pnpm docker:start
```

**This wipes:**

- AOF (Append-Only File)
- RDB snapshots
- All keys and data

**Use only if:**

- You're in local/dev
- You're 100% sure you want to lose everything

### Cleanup Recommendations by Environment

| Environment    | Recommended Action                   |
| -------------- | ------------------------------------ |
| **Local dev**  | `FLUSHALL` (fastest, zero mercy)     |
| **Shared dev** | Delete by prefix (e.g., `mandate:*`) |
| **Staging**    | Prefix deletion + TTL on new keys    |
| **Production** | ❌ **NEVER bulk delete blindly**     |

### Preventing Redis Bloat

**If Redis keeps getting "dirty":**

- ❌ You're not using TTLs
- ❌ You're treating Redis like a database
- ❌ You're missing key namespaces

**Redis is for:**

- ✅ Cache
- ✅ Ephemeral state
- ✅ Queues
- ✅ Coordination

**Not for:**

- ❌ Long-term storage
- ❌ Primary database
- ❌ Permanent data

**Best practices:**

1. Use key prefixes (Mandate SDK uses `mandate:`)
2. Set TTLs on volatile keys
3. Monitor memory: `redis-cli INFO memory`
4. Set max memory: `--maxmemory 2gb --maxmemory-policy allkeys-lru`

---

## Development Workflow

### Running Tests

**All tests (with Redis):**

```bash
pnpm docker:start  # Start Redis first
pnpm test
```

**Unit tests only (no Redis):**

```bash
pnpm --filter @mandate/sdk test -- tests/state/memory.test.ts tests/policy.test.ts
```

**Integration tests (requires Redis):**

```bash
pnpm docker:start
pnpm --filter @mandate/sdk test:integration
pnpm docker:stop  # Optional: stop after tests
```

**Watch mode:**

```bash
pnpm test:watch
```

**Coverage:**

```bash
pnpm test:coverage
```

### Running Examples

**Examples that require Redis:**

- `phase3-distributed-budget.ts`
- `phase3-multi-server.ts`

**Examples that require LLM (OpenAI or local):**

- `email-simple.ts`
- `email-with-mandate.ts`
- `retry-storm-llm.ts`
- `tool-hallucination.ts`

**Examples that work standalone:**

- `tool-permissions.ts`
- `budget-runaway.ts` (simulated LLM)
- `retry-storm.ts` (simulated API)

**Run example:**

```bash
# Check if Redis is needed
pnpm --filter @mandate/examples run example:phase3-budget

# If Redis not running, you'll see connection error
# Start Redis first:
pnpm docker:start
```

---

## Troubleshooting

### Redis Connection Errors

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution:**

```bash
# Start Redis
pnpm docker:start

# Verify it's running
docker ps | grep redis

# Test connection
docker exec -it $(docker ps -q -f name=redis) redis-cli ping
```

**Error:** `Redis connection timeout`

**Solution:**

```bash
# Check if Redis is healthy
docker ps --format "table {{.Names}}\t{{.Status}}"

# Restart Redis
pnpm docker:stop
pnpm docker:start

# Check logs
pnpm docker:logs
```

### LLM Connection Errors

**Error:** `API key not found` or `OpenAI API error`

**Solution:**

```bash
# Set OpenAI API key
export OPENAI_API_KEY=your-key-here

# Or use local LLM (Ollama)
# Install Ollama: https://ollama.ai
ollama serve  # Start Ollama server
ollama pull qwen2.5:3b  # Pull model

# Examples will use Ollama if OpenAI key not set
```

### Port Already in Use

**Error:** `Port 6379 is already in use`

**Solution:**

```bash
# Find what's using the port
lsof -i :6379

# Stop existing Redis
docker stop $(docker ps -q -f name=redis)

# Or use different port in docker-compose.yml
```

### Docker Not Running

**Error:** `Cannot connect to Docker daemon`

**Solution:**

```bash
# Start Docker Desktop (macOS/Windows)
# Or start Docker service (Linux)
sudo systemctl start docker

# Verify Docker is running
docker ps
```

---

## Backend API Setup (Phase 2)

### Quick Start

```bash
# Navigate to backend directory
cd apps/backend

# Install dependencies (if not already done from root)
pnpm install

# Start PostgreSQL
docker-compose -f docker-compose.dev.yml up -d

# Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env and set required values

# Run database migrations
pnpm db:migrate

# Start development server
pnpm start:dev
```

**Backend will be available at:**
- API: `http://localhost:3000`
- Swagger Docs: `http://localhost:3000/api`

### Backend Environment Variables

Create `apps/backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mandate
PORT=3000
NODE_ENV=development
JWT_SECRET=<generate-random-32-char-string>
API_KEY_SALT=<generate-random-32-char-string>
LOG_LEVEL=info
```

**Generate secrets:**

```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Generate API_KEY_SALT
openssl rand -base64 32
```

### Backend Testing

```bash
cd apps/backend

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:cov
```

See [apps/backend/README.md](../apps/backend/README.md) for complete backend documentation.

---

## Project Structure

```
mandate/
├── packages/
│   ├── sdk/              # Main SDK package
│   │   ├── docker-compose.yml  # Redis configuration
│   │   ├── src/          # Source code
│   │   └── tests/        # Test files
│   └── examples/         # Example applications
├── apps/
│   └── backend/          # Phase 2 Backend API (NestJS + PostgreSQL)
│       ├── src/          # Backend source code
│       ├── docker-compose.yml  # PostgreSQL configuration
│       └── README.md     # Backend documentation
├── package.json          # Root package.json (monorepo)
├── docs/
│   ├── SETUP.md         # This file
│   └── DEPLOYMENT.md    # Production deployment guide
├── README.md            # Project overview
```

---

## Environment Variables

**Optional (for examples):**

```bash
# Redis configuration (defaults to localhost:6379)
export REDIS_HOST=localhost
export REDIS_PORT=6379

# OpenAI API (for LLM examples)
export OPENAI_API_KEY=your-key-here

# Process ID (for distributed examples)
export PROCESS_ID=1
export MANDATE_ID=shared-mandate-id
```

---

## Next Steps

- **Read [README.md](../README.md)** - Project overview and quick start
- **Read [docs/DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **Explore [packages/examples](../packages/examples)** - Working examples
- **Read [packages/sdk/README.md](../packages/sdk/README.md)** - Full API documentation

---

## Need Help?

- **Issues:** [GitHub Issues](https://github.com/kashaf12/mandate/issues)
- **Discussions:** [GitHub Discussions](https://github.com/kashaf12/mandate/discussions)

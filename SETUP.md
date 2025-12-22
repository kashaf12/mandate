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

## Project Structure

```
mandate/
├── packages/
│   ├── sdk/              # Main SDK package
│   │   ├── docker-compose.yml  # Redis configuration
│   │   ├── src/          # Source code
│   │   └── tests/        # Test files
│   └── examples/         # Example applications
├── package.json          # Root package.json (monorepo)
├── SETUP.md             # This file
├── README.md            # Project overview
└── DEPLOYMENT.md        # Production deployment guide
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

- **Read [README.md](./README.md)** - Project overview and quick start
- **Read [DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **Explore [packages/examples](./packages/examples)** - Working examples
- **Read [packages/sdk/README.md](./packages/sdk/README.md)** - Full API documentation

---

## Need Help?

- **Issues:** [GitHub Issues](https://github.com/kashaf12/mandate/issues)
- **Discussions:** [GitHub Discussions](https://github.com/kashaf12/mandate/discussions)

# Mandate Backend (Phase 2)

NestJS + PostgreSQL + Drizzle backend for dynamic policy-driven mandate issuance.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Docker & Docker Compose

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
   # Option 1: Copy and edit manually
   cp .env.example .env

   # Option 2: Use the generation script (generates random secrets)
   ./scripts/generate-env.sh
   ```

4. **Run migrations (after schema is defined):**

   ```bash
   pnpm db:migrate
   ```

5. **Start development server:**
   ```bash
   pnpm start:dev
   ```

## Project Structure

```
apps/backend/
├── src/
│   ├── main.ts              # Application entry point
│   ├── app.module.ts        # Root module
│   ├── app.controller.ts    # Root controller
│   ├── app.service.ts       # Root service
│   └── database/
│       ├── database.module.ts  # Database connection module
│       ├── schema.ts           # Drizzle schema definitions
│       └── migrate.ts          # Migration runner
├── drizzle/                 # Migration files
├── docker-compose.yml       # PostgreSQL (production)
├── docker-compose.dev.yml   # PostgreSQL + pgAdmin (development)
├── Dockerfile               # NestJS app container
├── drizzle.config.ts        # Drizzle configuration
└── package.json

```

## Available Scripts

- `pnpm start` - Start production server
- `pnpm start:dev` - Start development server with watch mode
- `pnpm build` - Build for production
- `pnpm db:generate` - Generate Drizzle migrations
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Drizzle Studio (database UI)
- `pnpm test` - Run tests

## Architecture

**Context → Rules → Policies → Mandate**

- **Context**: Input data (agent, environment, etc.)
- **Rules**: Conditions that match context to policies
- **Policies**: Authority templates (versioned)
- **Mandate**: Issued authority envelope

## Database

PostgreSQL 16 running in Docker. Access via:

- Connection: `postgresql://postgres:postgres@localhost:5432/mandate` (or from .env)
- pgAdmin (dev only): http://localhost:5050 (admin@mandate.local / admin)

## Docker

### Development

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### Production

```bash
docker-compose up -d
```

### Build and run NestJS app

```bash
docker build -t mandate-backend .
docker run -p 3000:3000 --env-file .env --network mandate-db_default mandate-backend
```

## Development

This is a deployable API service (not a publishable package). It's part of the monorepo at `/mandate` alongside the SDK package.

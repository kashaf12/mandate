# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY apps/backend/package.json ./apps/backend/
COPY packages ./packages

# Install pnpm
RUN npm install -g pnpm@8.15.0

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/backend ./apps/backend
COPY tsconfig.base.json ./

# Build the application
WORKDIR /app/apps/backend
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY apps/backend/package.json ./apps/backend/

# Install pnpm
RUN npm install -g pnpm@8.15.0

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --filter @mandate/backend

# Copy built application
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

WORKDIR /app/apps/backend

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]


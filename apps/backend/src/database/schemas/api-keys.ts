import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * API Keys table - Organization-level authentication
 *
 * Key properties:
 * - Scoped to organization (not agent)
 * - Multiple keys per org (rotation support)
 * - Hash stored (plaintext never persisted)
 * - Status: 'active' | 'revoked' | 'rotating'
 * - Grace period: expiresAt for dual-key rotation
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    keyId: varchar('key_id', { length: 64 }).notNull().unique(),
    orgId: varchar('org_id', { length: 64 }).notNull(), // FK to organizations
    keyHash: varchar('key_hash', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }), // Optional: "Production Key", "Staging Key"
    status: varchar('status', { length: 32 }).default('active').notNull(), // 'active' | 'revoked' | 'rotating'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 255 }), // Principal who created key
    revokedAt: timestamp('revoked_at'),
    expiresAt: timestamp('expires_at'), // Grace period for rotation
  },
  (table) => [
    index('idx_api_keys_org_id').on(table.orgId),
    index('idx_api_keys_key_hash').on(table.keyHash),
    index('idx_api_keys_status').on(table.status),
    index('idx_api_keys_org_status').on(table.orgId, table.status), // Compound for active key lookup
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

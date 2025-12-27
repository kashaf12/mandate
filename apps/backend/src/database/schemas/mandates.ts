import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// Mandates table - Issued authority cache
export const mandates = pgTable(
  'mandates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mandateId: varchar('mandate_id', { length: 64 }).notNull().unique(),
    agentId: varchar('agent_id', { length: 64 }).notNull(),
    context: jsonb('context').$type<Record<string, any>>().notNull(),
    authority: jsonb('authority').$type<Record<string, any>>().notNull(),
    matchedRules: jsonb('matched_rules').$type<Array<string>>().notNull(),
    issuedAt: timestamp('issued_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    version: integer('version').default(1),
  },
  (table) => [
    index('idx_mandates_agent_id').on(table.agentId),
    index('idx_mandates_expires_at').on(table.expiresAt),
  ],
);

// Export TypeScript types
export type Mandate = typeof mandates.$inferSelect;
export type NewMandate = typeof mandates.$inferInsert;

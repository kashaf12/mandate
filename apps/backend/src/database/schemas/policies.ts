import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';

// Policies table - Authority templates (versioned)
export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    policyId: varchar('policy_id', { length: 64 }).notNull(),
    version: integer('version').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    authority: jsonb('authority').$type<Record<string, string>>().notNull(),
    active: boolean('active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    createdBy: varchar('created_by', { length: 255 }),
  },
  (table) => [
    index('idx_policies_policy_id').on(table.policyId),
    index('idx_policies_active').on(table.active),
    unique('unique_policy_version').on(table.policyId, table.version),
  ],
);

// Export TypeScript types
export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;

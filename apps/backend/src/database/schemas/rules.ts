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

// Rules table - Context → policy mapping (versioned)
export const rules = pgTable(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: varchar('rule_id', { length: 64 }).notNull(), // Remove .unique()
    version: integer('version').notNull(), // Add versioning
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    // Agent scoping (optional, null = applies to all agents)
    agentIds: jsonb('agent_ids').$type<string[] | null>(),
    // Match mode (AND or OR)
    matchMode: varchar('match_mode', { length: 8 }).default('AND'),
    conditions: jsonb('conditions')
      .$type<
        Array<{
          field: string;
          operator: string;
          value: string;
        }>
      >()
      .notNull(),
    policyId: varchar('policy_id', { length: 64 }).notNull(),
    active: boolean('active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_rules_policy_id').on(table.policyId),
    index('idx_rules_active').on(table.active),
    unique('unique_rule_version').on(table.ruleId, table.version), // Add unique constraint
  ],
);

// Export TypeScript types
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;

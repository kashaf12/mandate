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
} from 'drizzle-orm/pg-core';

// Rules table - Context → policy mapping
export const rules = pgTable(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ruleId: varchar('rule_id', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    priority: integer('priority').notNull(),
    conditions: jsonb('conditions').$type<Array<any>>().notNull(),
    policyId: varchar('policy_id', { length: 64 }).notNull(),
    active: boolean('active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_rules_policy_id').on(table.policyId),
    index('idx_rules_active_priority').on(table.active, table.priority),
  ],
);

// Export TypeScript types
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;

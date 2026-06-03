import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Agents table - Identity (decoupled from authentication)
 *
 * Changes from previous version:
 * - REMOVED: apiKeyHash (moved to api_keys table)
 * - ADDED: orgId (FK to organizations)
 *
 * Agent identity is now stable across API key rotations.
 */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: varchar('agent_id', { length: 64 }).notNull().unique(),
    orgId: varchar('org_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    principal: varchar('principal', { length: 255 }),
    status: varchar('status', { length: 32 }).default('active'),
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_agents_agent_id').on(table.agentId),
    index('idx_agents_org_id').on(table.orgId),
    index('idx_agents_status').on(table.status),
    index('idx_agents_org_status').on(table.orgId, table.status),
  ],
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

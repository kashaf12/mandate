import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// Agents table - Identity + API key hash
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: varchar('agent_id', { length: 64 }).notNull().unique(),
    apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    principal: varchar('principal', { length: 255 }),
    environment: varchar('environment', { length: 32 }).default('development'),
    status: varchar('status', { length: 32 }).default('active'),
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_agents_agent_id').on(table.agentId),
    index('idx_agents_api_key_hash').on(table.apiKeyHash),
    index('idx_agents_status').on(table.status),
  ],
);

// Export TypeScript types
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

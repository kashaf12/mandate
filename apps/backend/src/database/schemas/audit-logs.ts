import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// Audit logs table - Complete enforcement trail
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: varchar('agent_id', { length: 64 }).notNull(),
    actionId: varchar('action_id', { length: 64 }).notNull(),
    timestamp: timestamp('timestamp').notNull(),
    actionType: varchar('action_type', { length: 32 }).notNull(),
    toolName: varchar('tool_name', { length: 255 }),
    decision: varchar('decision', { length: 16 }).notNull(),
    reason: text('reason'),
    estimatedCost: decimal('estimated_cost', { precision: 10, scale: 6 }),
    actualCost: decimal('actual_cost', { precision: 10, scale: 6 }),
    cumulativeCost: decimal('cumulative_cost', { precision: 10, scale: 6 }),
    context: jsonb('context').$type<Record<string, string>>(),
    matchedRules:
      jsonb('matched_rules').$type<
        Array<{ rule_id: string; rule_version: number }>
      >(),
    metadata: jsonb('metadata').$type<Record<string, string>>(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_audit_agent_id').on(table.agentId),
    index('idx_audit_timestamp').on(table.timestamp),
    index('idx_audit_decision').on(table.decision),
    index('idx_audit_action_type').on(table.actionType),

    index('idx_audit_agent_decision_time').on(
      table.agentId,
      table.decision,
      table.timestamp,
    ),

    index('idx_audit_action_type_time').on(table.actionType, table.timestamp),
  ],
);

// Export TypeScript types
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core';

// Kill switches table - Emergency termination
export const killSwitches = pgTable('kill_switches', {
  agentId: varchar('agent_id', { length: 64 }).primaryKey(),
  killedAt: timestamp('killed_at').defaultNow(),
  reason: text('reason'),
  killedBy: varchar('killed_by', { length: 255 }),
});

// Export TypeScript types
export type KillSwitch = typeof killSwitches.$inferSelect;
export type NewKillSwitch = typeof killSwitches.$inferInsert;

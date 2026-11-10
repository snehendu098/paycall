import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { agents } from './agent.schema'
import { endpoints } from './endpoint.schema'

// time-based access: one paid call buys passSeconds of free calls
export const passes = pgTable(
  'passes',
  {
    agentPubkey: text().notNull().references(() => agents.pubkey, { onDelete: 'cascade' }),
    endpointId: text().notNull().references(() => endpoints.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.agentPubkey, t.endpointId] })],
)

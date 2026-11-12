import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { agents } from './agent.schema'
import { endpoints } from './endpoint.schema'
import { sellers } from './seller.schema'

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

// self-hosted (middleware) passes: seller-defined scope, no endpoint row
export const sellerPasses = pgTable(
  'seller_passes',
  {
    agentPubkey: text().notNull().references(() => agents.pubkey, { onDelete: 'cascade' }),
    sellerId: text().notNull().references(() => sellers.id),
    scope: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.agentPubkey, t.sellerId, t.scope] })],
)

// single-use PAYCALL-AGENT nonces (x402 SIWX style): replay = pk conflict. cron drops rows past the 5 min window
export const agentNonces = pgTable('agent_nonces', {
  id: text().primaryKey(), // <pubkey>:<nonce>
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

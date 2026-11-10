import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { agents } from './agent.schema'
import { createdAt, micros } from './common.schema'
import { sellers } from './seller.schema'

export const channels = pgTable(
  'channels',
  {
    id: uuid().primaryKey(),
    agentPubkey: text().notNull().references(() => agents.pubkey),
    sellerId: text().notNull().references(() => sellers.id),
    cumulative: micros().notNull(),
    seq: integer().notNull(),
    lastSig: text().notNull(),
    updatedAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.agentPubkey, t.sellerId)],
)

import { bigserial, index, pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { owners } from './owner.schema'
import { sellers } from './seller.schema'

export type EntryType = 'topup' | 'reload' | 'charge' | 'payout' | 'fee'

export const entries = pgTable(
  'entries',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    type: text().$type<EntryType>().notNull(),
    amount: micros().notNull(), // always positive, type = direction
    ownerId: text().references(() => owners.id),
    sellerId: text().references(() => sellers.id),
    agentPubkey: text(),
    ref: text().notNull().unique(), // idempotency: ch:<id>:<seq> | cap:<id> | payout:<id> | fee:<id>
    createdAt: createdAt(),
  },
  (t) => [index().on(t.ownerId, t.createdAt), index().on(t.sellerId, t.id)],
)

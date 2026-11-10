import { bigint, bigserial, index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { owners } from './owner.schema'
import { sellers } from './seller.schema'

export type EntryType = 'topup' | 'reload' | 'charge' | 'refund' | 'payout' | 'fee'

export const entries = pgTable(
  'entries',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    type: text().$type<EntryType>().notNull(),
    amount: micros().notNull(), // always positive, type = direction
    ownerId: text().references(() => owners.id),
    sellerId: text().references(() => sellers.id),
    agentPubkey: text(),
    ref: text().notNull().unique(), // idempotency: ch:<id>:<seq> | rf:<chargeId>:<tag> | cap:<id> | payout:<id> | fee:<id>
    parentId: bigint({ mode: 'number' }), // refund → its charge
    resource: text(), // charge: url paid for
    units: integer(), // metered charge: tokens/chars counted
    createdAt: createdAt(),
  },
  (t) => [index().on(t.ownerId, t.createdAt), index().on(t.sellerId, t.id), index().on(t.parentId)],
)

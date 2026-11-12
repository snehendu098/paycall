import { bigint, bigserial, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { entries } from './entry.schema'
import { owners } from './owner.schema'
import { sellers } from './seller.schema'

// buyer contests a charge → seller refunds or rejects (with reply) within 3d, else auto-refund.
// buyer can escalate a seller reject once (within 3d) → PayCall admin decides, final.
// held from seller payout while open, escalated, or rejected-but-still-escalatable (ledger heldOf)
export const disputes = pgTable('disputes', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  entryId: bigint({ mode: 'number' }).notNull().unique().references(() => entries.id),
  ownerId: text().notNull().references(() => owners.id),
  sellerId: text().notNull().references(() => sellers.id),
  amount: micros().notNull(), // disputable part of the charge when opened
  reason: text().notNull(),
  status: text().$type<'open' | 'escalated' | 'refunded' | 'rejected'>().notNull().default('open'),
  createdAt: createdAt(),
  resolvedAt: timestamp({ withTimezone: true }),
  reply: text(), // seller's reason on reject
  adminNote: text(), // PayCall's note on an escalated decision
  decidedBy: text().$type<'seller' | 'admin' | 'timeout' | 'buyer'>(), // buyer = marked resolved, no refund
  escalatedAt: timestamp({ withTimezone: true }),
})

import { bigint, bigserial, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { entries } from './entry.schema'
import { owners } from './owner.schema'
import { sellers } from './seller.schema'

// buyer contests a charge; open disputes hold that amount out of the seller's payout
export const disputes = pgTable('disputes', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  entryId: bigint({ mode: 'number' }).notNull().unique().references(() => entries.id),
  ownerId: text().notNull().references(() => owners.id),
  sellerId: text().notNull().references(() => sellers.id),
  amount: micros().notNull(), // disputable part of the charge when opened
  reason: text().notNull(),
  status: text().$type<'open' | 'refunded' | 'rejected'>().notNull().default('open'),
  createdAt: createdAt(),
  resolvedAt: timestamp({ withTimezone: true }),
})

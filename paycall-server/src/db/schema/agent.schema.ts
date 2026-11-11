import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { owners } from './owner.schema'

export const agents = pgTable('agents', {
  pubkey: text().primaryKey(),
  ownerId: text().notNull().references(() => owners.id),
  name: text().notNull(),
  paused: boolean().notNull().default(false),
  maxPrice: micros().notNull().default(1_000_000),
  dailyCap: micros(), // null = owner cap only
  approveAbove: micros(), // calls priced above → human approval
  allowedSellers: text().array(), // null = any seller
  createdAt: createdAt(),
  // soft delete: channels + ledger keep the pubkey (payouts sum channel cumulatives), key can never pay again
  deletedAt: timestamp({ withTimezone: true }),
})

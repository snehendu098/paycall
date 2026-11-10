import { pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { sellers } from './seller.schema'

export const payoutBatches = pgTable('payout_batches', {
  id: text().primaryKey(), // = paypal sender_batch_id
  paypalBatchId: text(),
  status: text().notNull().default('CREATED'),
  createdAt: createdAt(),
})

export const payoutItems = pgTable('payout_items', {
  id: text().primaryKey(), // = paypal sender_item_id
  batchId: text().notNull().references(() => payoutBatches.id),
  sellerId: text().notNull().references(() => sellers.id),
  gross: micros().notNull(),
  net: micros().notNull(),
  status: text().$type<'pending' | 'paid' | 'failed'>().notNull().default('pending'),
  paypalItemId: text(),
  createdAt: createdAt(),
})

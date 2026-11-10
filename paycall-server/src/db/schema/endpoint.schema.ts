import { pgTable, text } from 'drizzle-orm/pg-core'
import { randomId } from '../../lib/util'
import { createdAt, micros } from './common.schema'
import { sellers } from './seller.schema'

export const endpoints = pgTable('endpoints', {
  id: text().primaryKey().$defaultFn(() => randomId('ep')),
  sellerId: text().notNull().references(() => sellers.id),
  name: text().notNull(),
  upstreamUrl: text().notNull(),
  price: micros().notNull(),
  description: text().notNull().default(''),
  category: text().notNull().default(''),
  createdAt: createdAt(),
})

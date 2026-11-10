import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { randomId } from '../../lib/util'
import { createdAt, micros } from './common.schema'
import { sellers } from './seller.schema'

export type Pricing = 'call' | 'token' | 'char' | 'pass'

export const endpoints = pgTable('endpoints', {
  id: text().primaryKey().$defaultFn(() => randomId('ep')),
  sellerId: text().notNull().references(() => sellers.id),
  name: text().notNull(),
  upstreamUrl: text().notNull(),
  price: micros().notNull(), // per call | per token | per char | per pass, see pricing
  pricing: text().$type<Pricing>().notNull().default('call'),
  maxAmount: micros(), // metered: cap per call, what the agent signs
  passSeconds: integer(), // pass: access window bought by one payment
  description: text().notNull().default(''),
  category: text().notNull().default(''),
  upstreamHeaders: text('upstream_auth'), // sealed json {header: value} proxy adds upstream; write-only
  verified: boolean().notNull().default(false), // admin-set
  createdAt: createdAt(),
})

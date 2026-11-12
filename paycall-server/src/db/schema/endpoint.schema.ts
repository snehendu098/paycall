import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { randomId } from '../../lib/util'
import { createdAt, micros } from './common.schema'
import { sellers } from './seller.schema'

export type Pricing = 'call' | 'token' | 'char' | 'pass'
export type Probe = { ok: boolean; checkedAt: string; error?: string }
// hosted: seller's own server runs paycall-middleware; price informational (middleware enforces)
export type Route = { method: string; path: string; price: number; pricing: Pricing; maxAmount?: number; passSeconds?: number; description: string; example?: string; probe?: Probe }

export const endpoints = pgTable('endpoints', {
  id: text().primaryKey().$defaultFn(() => randomId('ep')),
  sellerId: text().notNull().references(() => sellers.id),
  name: text().notNull(),
  mode: text().$type<'proxy' | 'hosted'>().notNull().default('proxy'),
  upstreamUrl: text().notNull(), // proxy: forward target; hosted: base url agents call directly
  price: micros().notNull(), // per call | per token | per char | per pass, see pricing. hosted: cheapest route
  pricing: text().$type<Pricing>().notNull().default('call'),
  maxAmount: micros(), // metered: cap per call, what the agent signs
  passSeconds: integer(), // pass: access window bought by one payment
  description: text().notNull().default(''),
  category: text().notNull().default(''),
  docs: text().notNull().default(''), // markdown
  routes: jsonb().$type<Route[]>(), // hosted only
  upstreamHeaders: text('upstream_auth'), // sealed json {header: value} proxy adds upstream; write-only
  verified: boolean().notNull().default(false), // admin-set
  createdAt: createdAt(),
})

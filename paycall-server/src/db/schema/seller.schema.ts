import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'

export const sellers = pgTable(
  'sellers',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    paypalEmail: text().notNull(),
    apiKeyHash: text().notNull().unique(),
    keyName: text(),
    keyHint: text(), // "pc_seller_e4Mj…JWjS": full key only hashed, null = no usable key
    keyCreatedAt: timestamp({ withTimezone: true }),
    paidOut: micros().notNull().default(0),
    pendingPayout: micros().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check('pending_nonneg', sql`${t.pendingPayout} >= 0`)],
)

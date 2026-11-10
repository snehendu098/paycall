import { sql } from 'drizzle-orm'
import { check, pgTable, text } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'

export const owners = pgTable(
  'owners',
  {
    id: text().primaryKey(),
    email: text().notNull().unique(),
    apiKeyHash: text().notNull().unique(),
    balance: micros().notNull().default(0),
    vaultId: text(),
    paypalCustomerId: text(),
    reloadBelow: micros().notNull().default(2_000_000),
    reloadAmount: micros().notNull().default(10_000_000),
    dailyCap: micros().notNull().default(5_000_000),
    createdAt: createdAt(),
  },
  (t) => [check('balance_nonneg', sql`${t.balance} >= 0`)],
)

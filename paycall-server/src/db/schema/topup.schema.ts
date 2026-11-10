import { sql } from 'drizzle-orm'
import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { owners } from './owner.schema'

export const topups = pgTable(
  'topups',
  {
    id: text().primaryKey(), // sent to paypal as custom_id
    ownerId: text().notNull().references(() => owners.id),
    kind: text().$type<'manual' | 'auto'>().notNull(),
    status: text().$type<'pending' | 'completed' | 'failed'>().notNull().default('pending'),
    amount: micros().notNull(),
    paypalOrderId: text().unique(),
    captureId: text().unique(),
    createdAt: createdAt(),
  },
  // one in-flight auto reload per owner
  (t) => [uniqueIndex('one_pending_reload').on(t.ownerId).where(sql`${t.kind} = 'auto' and ${t.status} = 'pending'`)],
)

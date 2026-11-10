import { sql } from 'drizzle-orm'
import { bigserial, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, micros } from './common.schema'
import { agents } from './agent.schema'
import { owners } from './owner.schema'
import { sellers } from './seller.schema'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'used'

// call above agent.approveAbove: held until owner approves, approved row lets one matching voucher through
export const approvals = pgTable(
  'approvals',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    ownerId: text().notNull().references(() => owners.id),
    agentPubkey: text().notNull().references(() => agents.pubkey, { onDelete: 'cascade' }),
    sellerId: text().notNull().references(() => sellers.id),
    amount: micros().notNull(),
    resource: text().notNull().default(''),
    status: text().$type<ApprovalStatus>().notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex().on(t.agentPubkey, t.sellerId, t.amount).where(sql`status = 'pending'`), // retries don't pile up
    index().on(t.ownerId, t.status),
  ],
)

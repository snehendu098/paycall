import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, getTableColumns, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { disputes, entries } from '../db/schema'
import { factory } from '../lib/factory'

export const list = factory.createHandlers(
  zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), before: z.coerce.number().int().optional() })),
  async (c) => {
    const { limit, before } = c.req.valid('query')
    const { role, id } = c.var.principal
    const rows = await c.var.db
      .select({
        ...getTableColumns(entries),
        refunded: sql<number>`(select coalesce(sum(r.amount), 0) from entries r where r.parent_id = ${entries.id} and r.type = 'refund')`.mapWith(Number),
        dispute: sql<string | null>`(select status from disputes d where d.entry_id = ${entries.id})`,
      })
      .from(entries)
      .where(and(eq(role === 'owner' ? entries.ownerId : entries.sellerId, id), before ? lt(entries.id, before) : undefined))
      .orderBy(desc(entries.id))
      .limit(limit)
    return c.json(rows)
  },
)

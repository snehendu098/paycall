import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { agents, approvals, sellers } from '../db/schema'
import { factory } from '../lib/factory'

// pending calls held for owner; dashboard polls this
export const list = factory.createHandlers(async (c) =>
  c.json(
    await c.var.db
      .select({ id: approvals.id, amount: approvals.amount, resource: approvals.resource, createdAt: approvals.createdAt, agentName: agents.name, agentPubkey: approvals.agentPubkey, sellerId: approvals.sellerId, sellerName: sellers.name })
      .from(approvals)
      .innerJoin(agents, eq(agents.pubkey, approvals.agentPubkey))
      .innerJoin(sellers, eq(sellers.id, approvals.sellerId))
      .where(and(eq(approvals.ownerId, c.var.principal.id), eq(approvals.status, 'pending')))
      .orderBy(desc(approvals.id))
      .limit(50),
  ),
)

export const decide = factory.createHandlers(zValidator('json', z.object({ approve: z.boolean() })), async (c) => {
  const [a] = await c.var.db
    .update(approvals)
    .set({ status: c.req.valid('json').approve ? 'approved' : 'denied' })
    .where(and(eq(approvals.id, Number(c.req.param('id'))), eq(approvals.ownerId, c.var.principal.id), eq(approvals.status, 'pending')))
    .returning()
  if (!a) throw new HTTPException(404, { message: 'unknown or already decided' })
  return c.json(a)
})

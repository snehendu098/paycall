import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { disputes, entries } from '../db/schema'
import { factory } from '../lib/factory'
import { openDispute, refund, resolveDispute } from '../ledger'
import { zMicros } from '../lib/util'

const id = (c: { req: { param: (k: string) => string | undefined } }) => {
  const n = Number(c.req.param('id'))
  if (!Number.isSafeInteger(n) || n <= 0) throw new HTTPException(404, { message: 'unknown_charge' })
  return n
}
const out = <T extends { ok: true }>(r: T | { ok: false; reason: string }): T => {
  if (!r.ok) throw new HTTPException(409, { message: r.reason })
  return r
}

// seller gives money back: partial or (default) everything left
export const refundCharge = factory.createHandlers(zValidator('json', z.object({ amount: zMicros.positive().optional() })), async (c) =>
  c.json(out(await refund(c.var.db, id(c), c.var.principal.id, c.req.valid('json').amount ?? 'rest', `seller:${crypto.randomUUID()}`))),
)

// buyer contests a charge
export const dispute = factory.createHandlers(zValidator('json', z.object({ reason: z.string().trim().min(3).max(500) })), async (c) =>
  c.json(out(await openDispute(c.var.db, c.var.principal.id, id(c), c.req.valid('json').reason)).dispute, 201),
)

export const list = factory.createHandlers(async (c) => {
  const { role, id: me } = c.var.principal
  const rows = await c.var.db
    .select({ dispute: disputes, resource: entries.resource, chargedAt: entries.createdAt })
    .from(disputes)
    .innerJoin(entries, eq(entries.id, disputes.entryId))
    .where(eq(role === 'owner' ? disputes.ownerId : disputes.sellerId, me))
    .orderBy(desc(disputes.id))
    .limit(100)
  return c.json(rows.map((r) => ({ ...r.dispute, resource: r.resource, chargedAt: r.chargedAt })))
})

export const resolve = factory.createHandlers(zValidator('json', z.object({ action: z.enum(['refund', 'reject']) })), async (c) =>
  c.json(out(await resolveDispute(c.var.db, c.var.principal.id, id(c), c.req.valid('json').action)).dispute),
)

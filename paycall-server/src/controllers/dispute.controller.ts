import { zValidator } from '@hono/zod-validator'
import { desc, eq, sql, type SQL } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { agents, disputes, endpoints, entries, owners, sellers } from '../db/schema'
import { factory } from '../lib/factory'
import { closeDispute, decideDispute, escalateDispute, openDispute, refund } from '../ledger'
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

const rows = (db: Parameters<typeof decideDispute>[0], where: SQL) =>
  db
    .select({ dispute: disputes, resource: entries.resource, chargedAt: entries.createdAt })
    .from(disputes)
    .innerJoin(entries, eq(entries.id, disputes.entryId))
    .where(where)
    .orderBy(desc(disputes.id))
    .limit(100)
    .then((r) => r.map((x) => ({ ...x.dispute, resource: x.resource, chargedAt: x.chargedAt })))

export const list = factory.createHandlers(async (c) => {
  const { role, id: me } = c.var.principal
  return c.json(await rows(c.var.db, eq(role === 'owner' ? disputes.ownerId : disputes.sellerId, me)))
})

// reject needs reason buyer sees (+ PayCall if escalated)
const Decide = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refund'), reply: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal('reject'), reply: z.string().trim().min(3).max(500) }),
])

export const resolve = factory.createHandlers(zValidator('json', Decide), async (c) => {
  const { action, reply } = c.req.valid('json')
  return c.json(out(await decideDispute(c.var.db, id(c), { seller: c.var.principal.id }, action, reply)).dispute)
})

export const close = factory.createHandlers(async (c) => c.json(out(await closeDispute(c.var.db, c.var.principal.id, id(c))).dispute))
export const escalate = factory.createHandlers(async (c) => c.json(out(await escalateDispute(c.var.db, c.var.principal.id, id(c))).dispute))

// admin view: + parties, listing, charge detail
const adminRows = (db: Parameters<typeof decideDispute>[0], where: SQL) =>
  db
    .select({
      dispute: disputes,
      x: {
        resource: entries.resource, chargedAt: entries.createdAt, charged: entries.amount, units: entries.units, unit: entries.unit, agentPubkey: entries.agentPubkey,
        ownerEmail: owners.email, agentName: agents.name, seller: sellers.name, sellerPaypal: sellers.paypalEmail,
        endpointId: endpoints.id, endpoint: endpoints.name, pricing: endpoints.pricing, price: endpoints.price, maxAmount: endpoints.maxAmount, passSeconds: endpoints.passSeconds,
      },
    })
    .from(disputes)
    .innerJoin(entries, eq(entries.id, disputes.entryId))
    .innerJoin(owners, eq(owners.id, disputes.ownerId))
    .innerJoin(sellers, eq(sellers.id, disputes.sellerId))
    .leftJoin(agents, eq(agents.pubkey, entries.agentPubkey))
    .leftJoin(endpoints, eq(endpoints.id, sql`substring(${entries.resource} from '/p/([^/?#]+)')`))
    .where(where)
    .orderBy(desc(disputes.id))
    .limit(100)
    .then((r) => r.map((x) => ({ ...x.dispute, ...x.x })))

// admin (PayCall) queue + final call
export const escalated = factory.createHandlers(async (c) => c.json(await adminRows(c.var.db, eq(disputes.status, 'escalated'))))
export const adminGet = factory.createHandlers(async (c) => {
  const [d] = await adminRows(c.var.db, eq(disputes.id, id(c)))
  if (!d) throw new HTTPException(404, { message: 'unknown_dispute' })
  return c.json(d)
})
export const adminDecide = factory.createHandlers(zValidator('json', z.object({ action: z.enum(['refund', 'reject']), reply: z.string().trim().max(500).optional() })), async (c) => {
  const { action, reply } = c.req.valid('json')
  return c.json(out(await decideDispute(c.var.db, id(c), 'admin', action, reply)).dispute)
})

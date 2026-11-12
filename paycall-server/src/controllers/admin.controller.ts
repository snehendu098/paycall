import { zValidator } from '@hono/zod-validator'
import { count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { sumMicros } from '../db'
import { agents, channels, endpoints, entries, owners, sellers } from '../db/schema'
import { heldOf, refundedOf } from '../ledger'
import { factory } from '../lib/factory'
import { settleAll } from '../payouts'

export const settleNow = factory.createHandlers(async (c) => c.json({ batchId: await settleAll(c.env) }))

// verified badge in catalog = reviewed by PayCall
export const verify = factory.createHandlers(zValidator('json', z.object({ verified: z.boolean() })), async (c) => {
  const [ep] = await c.var.db
    .update(endpoints)
    .set(c.req.valid('json'))
    .where(eq(endpoints.id, c.req.param('id')!))
    .returning({ id: endpoints.id, verified: endpoints.verified })
  if (!ep) throw new HTTPException(404, { message: 'unknown endpoint' })
  return c.json(ep)
})

// ponytail: all listings, no paging; add ?before when catalog > few hundred
export const listEndpoints = factory.createHandlers(async (c) =>
  c.json(
    await c.var.db
      .select({ id: endpoints.id, name: endpoints.name, seller: sellers.name, sellerId: endpoints.sellerId, pricing: endpoints.pricing, price: endpoints.price, maxAmount: endpoints.maxAmount, passSeconds: endpoints.passSeconds, verified: endpoints.verified, createdAt: endpoints.createdAt })
      .from(endpoints)
      .innerJoin(sellers, eq(sellers.id, endpoints.sellerId))
      .orderBy(desc(endpoints.createdAt)),
  ),
)

const n = async (q: Promise<{ n: number }[]>) => (await q)[0]!.n
// platform totals. owed = same formula as payouts (gross − paid − reserved − refunded − held)
export const stats = factory.createHandlers(async (c) => {
  const db = c.var.db
  const owners_ = await n(db.select({ n: count() }).from(owners))
  const sellers_ = await n(db.select({ n: count() }).from(sellers))
  const agents_ = await n(db.select({ n: count() }).from(agents).where(isNull(agents.deletedAt)))
  const listings = await n(db.select({ n: count() }).from(endpoints))
  const vol = await db.select({ type: entries.type, n: sumMicros(entries.amount) }).from(entries).where(inArray(entries.type, ['charge', 'refund'])).groupBy(entries.type)
  const [charged, refunded] = (['charge', 'refund'] as const).map((t) => vol.find((v) => v.type === t)?.n ?? 0)
  const per = await db
    .select({ gross: sumMicros(channels.cumulative), paidOut: sellers.paidOut, pending: sellers.pendingPayout, refunded: refundedOf(sellers.id), held: heldOf(sellers.id) })
    .from(sellers)
    .leftJoin(channels, eq(channels.sellerId, sellers.id))
    .groupBy(sellers.id)
  const sum = (f: (r: (typeof per)[number]) => number) => per.reduce((a, r) => a + f(r), 0)
  return c.json({
    owners: owners_, sellers: sellers_, agents: agents_, listings, charged, refunded,
    held: sum((r) => r.held), paidOut: sum((r) => r.paidOut), pending: sum((r) => r.pending),
    owed: sum((r) => Math.max(0, r.gross - r.paidOut - r.pending - r.refunded - r.held)),
  })
})

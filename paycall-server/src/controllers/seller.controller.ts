import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { sumMicros } from '../db'
import { channels, payoutItems, sellers } from '../db/schema'
import { newApiKey } from '../lib/auth'
import { factory } from '../lib/factory'
import { randomId, sha256 } from '../lib/util'
import { heldOf, refundedOf } from '../ledger'

export const create = factory.createHandlers(
  zValidator('json', z.object({ name: z.string().min(1).max(64), paypalEmail: z.email() })),
  async (c) => {
    const id = randomId('sel')
    const apiKey = newApiKey('seller')
    await c.var.db.insert(sellers).values({ id, ...c.req.valid('json'), apiKeyHash: await sha256(apiKey) })
    return c.json({ id, apiKey }, 201)
  },
)

export const me = factory.createHandlers(async (c) => {
  const db = c.var.db
  const id = c.var.principal.id
  const [{ apiKeyHash: _, ...seller }] = await db.select().from(sellers).where(eq(sellers.id, id))
  const [{ gross }] = await db.select({ gross: sumMicros(channels.cumulative) }).from(channels).where(eq(channels.sellerId, id))
  const [{ refunded, held }] = await db.select({ refunded: refundedOf(id), held: heldOf(id) }).from(sellers).where(eq(sellers.id, id))
  const payouts = await db.select().from(payoutItems).where(eq(payoutItems.sellerId, id)).orderBy(desc(payoutItems.createdAt)).limit(20)
  const earned = gross - refunded
  return c.json({ seller, earned, refunded, held, owed: earned - held - seller.paidOut - seller.pendingPayout, payouts })
})

// rotate key: old key dies now (cache entry dropped), new key shown once
export const rotateKey = factory.createHandlers(async (c) => {
  const id = c.var.principal.id
  const apiKey = newApiKey('seller')
  const [old] = await c.var.db.select({ h: sellers.apiKeyHash }).from(sellers).where(eq(sellers.id, id))
  await c.var.db.update(sellers).set({ apiKeyHash: await sha256(apiKey) }).where(eq(sellers.id, id))
  if (old) await c.env.KV.delete(`apikey:${old.h}`)
  return c.json({ apiKey }, 201)
})

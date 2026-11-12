import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { sumMicros } from '../db'
import { channels, payoutItems, sellers } from '../db/schema'
import { newApiKey } from '../lib/auth'
import type { DB } from '../db'
import { factory } from '../lib/factory'
import { randomId, sha256 } from '../lib/util'
import { heldOf, refundedOf } from '../ledger'

export const create = factory.createHandlers(
  zValidator('json', z.object({ name: z.string().min(1).max(64), paypalEmail: z.email() })),
  async (c) => {
    const id = randomId('sel')
    const apiKey = newApiKey('seller')
    await c.var.db.insert(sellers).values({ id, ...c.req.valid('json'), apiKeyHash: await sha256(apiKey), keyName: 'default', keyHint: hint(apiKey), keyCreatedAt: new Date() })
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

const hint = (k: string) => `${k.slice(0, 14)}…${k.slice(-4)}`

// swap key hash: old key dies now (auth cache dropped). revoke = unknown random key, no hint
async function setKey(db: DB, kv: KVNamespace, id: string, apiKey: string, name: string | null) {
  const [old] = await db.select({ h: sellers.apiKeyHash }).from(sellers).where(eq(sellers.id, id))
  await db.update(sellers).set({ apiKeyHash: await sha256(apiKey), keyName: name, keyHint: name && hint(apiKey), keyCreatedAt: name ? new Date() : null }).where(eq(sellers.id, id))
  if (old) await kv.delete(`apikey:${old.h}`)
}

// new key shown once
export const rotateKey = factory.createHandlers(zValidator('json', z.object({ name: z.string().trim().min(1).max(64) })), async (c) => {
  const apiKey = newApiKey('seller'), { name } = c.req.valid('json')
  await setKey(c.var.db, c.env.KV, c.var.principal.id, apiKey, name)
  return c.json({ apiKey, keyName: name, keyHint: hint(apiKey) }, 201)
})

export const revokeKey = factory.createHandlers(async (c) => {
  await setKey(c.var.db, c.env.KV, c.var.principal.id, newApiKey('seller'), null)
  return c.json({ revoked: true })
})

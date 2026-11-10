import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { sumMicros } from '../db'
import { channels, payoutItems, sellers } from '../db/schema'
import { newApiKey } from '../lib/auth'
import { factory } from '../lib/factory'
import { randomId, sha256 } from '../lib/util'

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
  const [{ earned }] = await db.select({ earned: sumMicros(channels.cumulative) }).from(channels).where(eq(channels.sellerId, id))
  const payouts = await db.select().from(payoutItems).where(eq(payoutItems.sellerId, id)).orderBy(desc(payoutItems.createdAt)).limit(20)
  return c.json({ seller, earned, owed: earned - seller.paidOut - seller.pendingPayout, payouts })
})

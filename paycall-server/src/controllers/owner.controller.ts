import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { sumMicros } from '../db'
import { agents, entries, owners } from '../db/schema'
import { newApiKey } from '../lib/auth'
import { factory } from '../lib/factory'
import { randomId, sha256, zMicros } from '../lib/util'

export const create = factory.createHandlers(zValidator('json', z.object({ email: z.email() })), async (c) => {
  const id = randomId('own')
  const apiKey = newApiKey('owner')
  await c.var.db.insert(owners).values({ id, email: c.req.valid('json').email, apiKeyHash: await sha256(apiKey) })
  return c.json({ id, apiKey }, 201) // only time key is shown
})

export const me = factory.createHandlers(async (c) => {
  const db = c.var.db
  const id = c.var.principal.id
  // sequential: one pg client per request, no concurrent queries
  const [{ apiKeyHash: _, ...owner }] = await db.select().from(owners).where(eq(owners.id, id))
  const agentList = await db.select().from(agents).where(eq(agents.ownerId, id))
  const spendBySeller = await db
    .select({ sellerId: entries.sellerId, spent: sumMicros(entries.amount) })
    .from(entries)
    .where(and(eq(entries.ownerId, id), eq(entries.type, 'charge')))
    .groupBy(entries.sellerId)
  return c.json({ owner, agents: agentList, spendBySeller })
})

export const update = factory.createHandlers(
  zValidator('json', z.object({ reloadBelow: zMicros, reloadAmount: zMicros.min(1_000_000), dailyCap: zMicros }).partial()),
  async (c) => {
    const [owner] = await c.var.db
      .update(owners)
      .set(c.req.valid('json'))
      .where(eq(owners.id, c.var.principal.id))
      .returning({ reloadBelow: owners.reloadBelow, reloadAmount: owners.reloadAmount, dailyCap: owners.dailyCap })
    return c.json(owner)
  },
)

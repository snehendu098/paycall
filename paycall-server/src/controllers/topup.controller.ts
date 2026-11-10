import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { owners } from '../db/schema'
import { factory } from '../lib/factory'
import { captureTopup, createTopup } from '../topups'

// $1..$500, whole cents
export const create = factory.createHandlers(
  zValidator('json', z.object({ amount: z.number().int().min(1_000_000).max(500_000_000).multipleOf(10_000) })),
  async (c) => {
    const [owner] = await c.var.db.select().from(owners).where(eq(owners.id, c.var.principal.id))
    const orderId = await createTopup(c.env, c.var.db, owner, c.req.valid('json').amount)
    return c.json({ orderId })
  },
)

export const capture = factory.createHandlers(zValidator('json', z.object({ orderId: z.string().min(1).max(64) })), async (c) =>
  c.json(await captureTopup(c.env, c.var.db, c.var.principal.id, c.req.valid('json').orderId)),
)

import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { agents } from '../db/schema'
import { factory } from '../lib/factory'
import { zMicros } from '../lib/util'
import { Voucher } from '../lib/voucher'

export const create = factory.createHandlers(
  zValidator('json', z.object({ pubkey: Voucher.shape.payer, name: z.string().min(1).max(64), maxPrice: zMicros.optional() })),
  async (c) => {
    const [agent] = await c.var.db
      .insert(agents)
      .values({ ...c.req.valid('json'), ownerId: c.var.principal.id })
      .returning()
    return c.json(agent, 201)
  },
)

export const update = factory.createHandlers(
  zValidator('json', z
      .object({
        paused: z.boolean(),
        maxPrice: zMicros,
        dailyCap: zMicros.nullable(),
        approveAbove: zMicros.nullable(),
        allowedSellers: z.array(z.string().min(1).max(64)).max(100).nullable(),
      })
      .partial()),
  async (c) => {
    const [agent] = await c.var.db
      .update(agents)
      .set(c.req.valid('json'))
      .where(and(eq(agents.pubkey, c.req.param('pubkey')!), eq(agents.ownerId, c.var.principal.id)))
      .returning()
    if (!agent) throw new HTTPException(404, { message: 'unknown agent' })
    return c.json(agent)
  },
)

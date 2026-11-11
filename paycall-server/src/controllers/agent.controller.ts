import { zValidator } from '@hono/zod-validator'
import { and, eq, isNull } from 'drizzle-orm'
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

const mine = (pubkey: string, ownerId: string) => and(eq(agents.pubkey, pubkey), eq(agents.ownerId, ownerId), isNull(agents.deletedAt))

export const update = factory.createHandlers(
  zValidator('json', z
      .object({
        name: z.string().trim().min(1).max(64),
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
      .where(mine(c.req.param('pubkey')!, c.var.principal.id))
      .returning()
    if (!agent) throw new HTTPException(404, { message: 'unknown agent' })
    return c.json(agent)
  },
)

// revoke + hide. hosted MCP grants holding this key stop working (payments + wallet_info check deletedAt)
export const remove = factory.createHandlers(async (c) => {
  const [agent] = await c.var.db
    .update(agents)
    .set({ deletedAt: new Date(), paused: true })
    .where(mine(c.req.param('pubkey')!, c.var.principal.id))
    .returning({ pubkey: agents.pubkey })
  if (!agent) throw new HTTPException(404, { message: 'unknown agent' })
  return c.body(null, 204)
})

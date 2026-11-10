import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { endpoints } from '../db/schema'
import { factory } from '../lib/factory'
import { zMicros } from '../lib/util'

const upstreamUrl = z
  .url({ protocol: /^https$/ })
  .transform((u) => u.replace(/\/+$/, ''))

export const create = factory.createHandlers(
  zValidator('json', z.object({ name: z.string().min(1).max(64), upstreamUrl, price: zMicros.positive() })),
  async (c) => {
    const [ep] = await c.var.db
      .insert(endpoints)
      .values({ ...c.req.valid('json'), sellerId: c.var.principal.id })
      .returning()
    return c.json(ep, 201)
  },
)

export const list = factory.createHandlers(async (c) =>
  c.json(await c.var.db.select().from(endpoints).where(eq(endpoints.sellerId, c.var.principal.id)).orderBy(desc(endpoints.createdAt))),
)

export const remove = factory.createHandlers(async (c) => {
  const [ep] = await c.var.db
    .delete(endpoints)
    .where(and(eq(endpoints.id, c.req.param('id')!), eq(endpoints.sellerId, c.var.principal.id)))
    .returning({ id: endpoints.id })
  if (!ep) throw new HTTPException(404, { message: 'unknown endpoint' })
  return c.json(ep)
})

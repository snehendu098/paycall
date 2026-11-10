import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { endpoints } from '../db/schema'
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

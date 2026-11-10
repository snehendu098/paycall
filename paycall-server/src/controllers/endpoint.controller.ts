import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { endpoints } from '../db/schema'
import { factory } from '../lib/factory'
import { seal } from '../lib/seal'
import { zMicros } from '../lib/util'

const upstreamUrl = z
  .url({ protocol: /^https$/ })
  .transform((u) => u.replace(/\/+$/, ''))

// one header, e.g. "x-api-key: sk_..."; no CR/LF (header injection)
const upstreamAuth = z.string().max(2000).regex(/^[A-Za-z0-9-]+:[^\r\n]+$/, 'expected "Header-Name: value"')

// never return the sealed secret, only whether one is set
const { upstreamAuth: _sealed, ...pub } = getTableColumns(endpoints)
const cols = { ...pub, hasAuth: sql<boolean>`${endpoints.upstreamAuth} is not null` }

const Meta = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  category: z.string().max(32).optional(),
})

export const create = factory.createHandlers(
  zValidator('json', Meta.extend({ upstreamUrl, price: zMicros.positive(), upstreamAuth: upstreamAuth.optional() })),
  async (c) => {
    const { upstreamAuth: a, ...v } = c.req.valid('json')
    const [ep] = await c.var.db
      .insert(endpoints)
      .values({ ...v, sellerId: c.var.principal.id, upstreamAuth: a && (await seal(c.env.BETTER_AUTH_SECRET, a)) })
      .returning(cols)
    return c.json(ep, 201)
  },
)

export const list = factory.createHandlers(async (c) =>
  c.json(await c.var.db.select(cols).from(endpoints).where(eq(endpoints.sellerId, c.var.principal.id)).orderBy(desc(endpoints.createdAt))),
)

export const remove = factory.createHandlers(async (c) => {
  const [ep] = await c.var.db
    .delete(endpoints)
    .where(and(eq(endpoints.id, c.req.param('id')!), eq(endpoints.sellerId, c.var.principal.id)))
    .returning({ id: endpoints.id })
  if (!ep) throw new HTTPException(404, { message: 'unknown endpoint' })
  return c.json(ep)
})

// upstreamAuth: string = replace, null = clear, absent = keep
export const update = factory.createHandlers(zValidator('json', Meta.extend({ price: zMicros.positive(), upstreamAuth: upstreamAuth.nullable() }).partial()), async (c) => {
  const { upstreamAuth: a, ...v } = c.req.valid('json')
  const [ep] = await c.var.db
    .update(endpoints)
    .set({ ...v, ...(a !== undefined && { upstreamAuth: a && (await seal(c.env.BETTER_AUTH_SECRET, a)) }) })
    .where(and(eq(endpoints.id, c.req.param('id')!), eq(endpoints.sellerId, c.var.principal.id)))
    .returning(cols)
  if (!ep) throw new HTTPException(404, { message: 'unknown endpoint' })
  return c.json(ep)
})

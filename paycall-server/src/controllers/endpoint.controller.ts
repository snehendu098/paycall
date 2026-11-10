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

// seller's upstream keys, e.g. {"x-api-key": "sk_..."}; token names, no CR/LF (header injection)
const RESERVED = /^(host|connection|content-length|transfer-encoding|cookie|payment-.*|cf-.*|x-forwarded-.*)$/i
const upstreamHeaders = z
  .record(
    z.string().regex(/^[A-Za-z0-9-]{1,64}$/, 'header name: letters, digits, -').refine((k) => !RESERVED.test(k), 'reserved header'),
    z.string().min(1).max(2000).regex(/^[^\r\n]*$/, 'no line breaks'),
  )
  .refine((o) => Object.keys(o).length <= 10, 'max 10 headers')
const sealHeaders = async (secret: string, h: Record<string, string> | null | undefined) =>
  h && Object.keys(h).length ? seal(secret, JSON.stringify(h)) : null

// never return the sealed secret, only whether one is set
const { upstreamHeaders: _sealed, ...pub } = getTableColumns(endpoints)
const cols = { ...pub, hasAuth: sql<boolean>`${endpoints.upstreamHeaders} is not null` }

const Meta = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  category: z.string().max(32).optional(),
})

// price means: per call | per token | per char | per pass. sent as a unit (absent = keep); unused fields nulled
const NoPricing = z
  .object({
    pricing: z.enum(['call', 'token', 'char', 'pass']).optional(),
    maxAmount: zMicros.positive().optional(), // metered: cap per call the agent signs
    passSeconds: z.number().int().min(60).max(30 * 86_400).optional(),
  })
  .refine((p) => (p.pricing === 'token' || p.pricing === 'char' ? p.maxAmount : true), { message: 'metered pricing needs maxAmount', path: ['maxAmount'] })
  .refine((p) => (p.pricing === 'pass' ? p.passSeconds : true), { message: 'pass pricing needs passSeconds', path: ['passSeconds'] })
  .transform((p) =>
    p.pricing
      ? { pricing: p.pricing, maxAmount: p.pricing === 'token' || p.pricing === 'char' ? p.maxAmount! : null, passSeconds: p.pricing === 'pass' ? p.passSeconds! : null }
      : {},
  )

export const create = factory.createHandlers(
  zValidator('json', z.intersection(Meta.extend({ upstreamUrl, price: zMicros.positive(), upstreamHeaders: upstreamHeaders.optional() }), NoPricing)),
  async (c) => {
    const { upstreamHeaders: h, ...v } = c.req.valid('json')
    const [ep] = await c.var.db
      .insert(endpoints)
      .values({ ...v, sellerId: c.var.principal.id, upstreamHeaders: await sealHeaders(c.env.BETTER_AUTH_SECRET, h) })
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

// upstreamHeaders: object = replace all, null/{} = clear, absent = keep
export const update = factory.createHandlers(zValidator('json', z.intersection(Meta.extend({ price: zMicros.positive(), upstreamHeaders: upstreamHeaders.nullable() }).partial(), NoPricing)), async (c) => {
  const { upstreamHeaders: h, ...v } = c.req.valid('json')
  const [ep] = await c.var.db
    .update(endpoints)
    .set({ ...v, ...(h !== undefined && { upstreamHeaders: await sealHeaders(c.env.BETTER_AUTH_SECRET, h) }) })
    .where(and(eq(endpoints.id, c.req.param('id')!), eq(endpoints.sellerId, c.var.principal.id)))
    .returning(cols)
  if (!ep) throw new HTTPException(404, { message: 'unknown endpoint' })
  return c.json(ep)
})

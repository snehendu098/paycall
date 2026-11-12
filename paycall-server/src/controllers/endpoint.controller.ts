import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { endpoints } from '../db/schema'
import type { Route } from '../db/schema/endpoint.schema'
import { factory } from '../lib/factory'
import { seal } from '../lib/seal'
import { toMicros, zMicros } from '../lib/util'
import { SCHEME } from '../payments'

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
  docs: z.string().max(20_000).optional(), // markdown
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

const PRICINGS = ['call', 'token', 'char', 'pass'] as const
// leading / + url path chars only: base + path can't change host (no @ tricks via \\, //, ?)
const zPath = z.string().max(200).regex(/^\/(?!\/)[\w\-.~%!$&'()*+,;=:@/]*$/, 'path: starts with /, no spaces, ? or #')
const ParamPath = /\/:/
const Route = z
  .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    path: zPath,
    price: zMicros.positive(),
    pricing: z.enum(PRICINGS).default('call'),
    maxAmount: zMicros.positive().optional(),
    passSeconds: z.number().int().min(60).max(30 * 86_400).optional(),
    description: z.string().max(300).default(''),
    example: zPath.refine((p) => !ParamPath.test(p), 'example: real path, no :params').optional(), // for /:param paths, used by probe
  })
  .refine((r) => (r.pricing === 'token' || r.pricing === 'char' ? r.maxAmount : true), { message: 'metered pricing needs maxAmount', path: ['maxAmount'] })
  .refine((r) => (r.pricing === 'pass' ? r.passSeconds : true), { message: 'pass pricing needs passSeconds', path: ['passSeconds'] })
const routes = z.array(Route).min(1, 'add at least one route').max(50, 'max 50 routes')

const Proxy = z.intersection(Meta.extend({ upstreamUrl, price: zMicros.positive(), upstreamHeaders: upstreamHeaders.optional() }), NoPricing)
const Hosted = Meta.extend({ baseUrl: upstreamUrl, routes })
const ProxyPatch = z.intersection(Meta.extend({ price: zMicros.positive(), upstreamHeaders: upstreamHeaders.nullable() }).partial(), NoPricing)
const HostedPatch = Hosted.partial()

// "routes.0.price: Too small" — readable in dashboard + import errors
const parse = <T extends z.ZodType>(schema: T, body: unknown): z.output<T> => {
  const r = schema.safeParse(body)
  if (!r.success) throw new HTTPException(400, { message: r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ') })
  return r.data
}
const body = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null)
const modeOf = (b: unknown) => ((b as { mode?: unknown } | null)?.mode === 'hosted' ? 'hosted' : 'proxy')
export const parseCreate = (b: unknown) => (modeOf(b) === 'hosted' ? { mode: 'hosted' as const, ...parse(Hosted, b) } : { mode: 'proxy' as const, ...parse(Proxy, b) })

// GET (method, no payment, no seller headers) → must 402 with PAYMENT-REQUIRED offering paycall-prepaid to this seller
async function check(url: string, method: string, sellerId: string): Promise<string | undefined> {
  let res: Response
  try {
    res = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(5000) })
  } catch (e) {
    return (e as Error).name === 'TimeoutError' ? 'timeout after 5s' : 'unreachable'
  }
  await res.body?.cancel()
  if (res.status !== 402) return `expected 402, got ${res.status}`
  const h = res.headers.get('payment-required')
  if (!h) return 'no PAYMENT-REQUIRED header'
  let pr: { accepts?: { scheme?: string; payTo?: string }[] }
  try {
    pr = JSON.parse(atob(h))
  } catch {
    return 'PAYMENT-REQUIRED is not base64 JSON'
  }
  const a = Array.isArray(pr?.accepts) ? pr.accepts.filter((x) => x?.scheme === SCHEME) : []
  if (!a.length) return `no ${SCHEME} offer (use @paycall-live/middleware)`
  if (!a.some((x) => x.payTo === sellerId)) return 'payTo is not your seller id (wrong API key?)'
}

export const probe = (baseUrl: string, sellerId: string, rs: Route[]): Promise<Route[]> => {
  const checkedAt = new Date().toISOString()
  return Promise.all(
    rs.map(async ({ probe: _, ...r }) => {
      const path = ParamPath.test(r.path) ? r.example : r.path
      const error = path ? await check(baseUrl + path, r.method, sellerId) : 'needs_example'
      return { ...r, probe: { ok: !error, checkedAt, ...(error && { error }) } }
    }),
  )
}

// hosted card price = cheapest route
const cheapest = (rs: Route[]) => {
  const r = rs.reduce((a, b) => (b.price < a.price ? b : a))
  return { price: r.price, pricing: r.pricing, maxAmount: r.maxAmount ?? null, passSeconds: r.passSeconds ?? null }
}

export const create = factory.createHandlers(async (c) => {
  const v = parseCreate(await body(c))
  const sellerId = c.var.principal.id
  const values =
    v.mode === 'hosted'
      ? (async ({ baseUrl, routes, ...m }: typeof v) => ({ ...m, upstreamUrl: baseUrl, ...cheapest(routes), routes: await probe(baseUrl, sellerId, routes) }))(v)
      : { ...v, upstreamHeaders: await sealHeaders(c.env.BETTER_AUTH_SECRET, v.upstreamHeaders) }
  const [ep] = await c.var.db
    .insert(endpoints)
    .values({ ...(await values), sellerId })
    .returning(cols)
  return c.json(ep, 201)
})

// manifest (paycall.json): create body with dollar-string prices → validated create body, not saved
const USD = 'dollars as a string, e.g. "0.005"'
const usd = z.string({ error: USD }).regex(/^\d+(\.\d{1,6})?$/, USD).transform(toMicros)
const Money = z.looseObject({ price: usd.optional(), maxAmount: usd.optional() })
const Manifest = Money.extend({ routes: z.array(Money).optional() })
export const importManifest = factory.createHandlers(async (c) => c.json(parseCreate(parse(Manifest, await body(c)))))
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

const own = (c: { req: { param: (k: string) => string | undefined }; var: { principal: { id: string } } }) =>
  and(eq(endpoints.id, c.req.param('id')!), eq(endpoints.sellerId, c.var.principal.id))

// mode fixed at create. proxy upstreamHeaders: object = replace all, null/{} = clear, absent = keep. hosted: re-probed on every save
export const update = factory.createHandlers(async (c) => {
  const [cur] = await c.var.db.select({ mode: endpoints.mode, upstreamUrl: endpoints.upstreamUrl, routes: endpoints.routes }).from(endpoints).where(own(c))
  if (!cur) throw new HTTPException(404, { message: 'unknown endpoint' })
  const b = await body(c)
  let set: Partial<typeof endpoints.$inferInsert>
  if (cur.mode === 'hosted') {
    const { baseUrl, routes: rs, ...m } = parse(HostedPatch, b)
    const base = baseUrl ?? cur.upstreamUrl
    const next = await probe(base, c.var.principal.id, rs ?? cur.routes ?? [])
    set = { ...m, upstreamUrl: base, routes: next, ...(next.length && cheapest(next)) }
  } else {
    const { upstreamHeaders: h, ...v } = parse(ProxyPatch, b)
    set = { ...v, ...(h !== undefined && { upstreamHeaders: await sealHeaders(c.env.BETTER_AUTH_SECRET, h) }) }
  }
  const [ep] = await c.var.db.update(endpoints).set(set).where(own(c)).returning(cols)
  return c.json(ep)
})

// "Re-check": probe hosted routes again
export const recheck = factory.createHandlers(async (c) => {
  const [cur] = await c.var.db.select({ mode: endpoints.mode, upstreamUrl: endpoints.upstreamUrl, routes: endpoints.routes }).from(endpoints).where(own(c))
  if (!cur) throw new HTTPException(404, { message: 'unknown endpoint' })
  if (cur.mode !== 'hosted') throw new HTTPException(400, { message: 'only hosted listings are probed' })
  const [ep] = await c.var.db.update(endpoints).set({ routes: await probe(cur.upstreamUrl, c.var.principal.id, cur.routes ?? []) }).where(own(c)).returning(cols)
  return c.json(ep)
})

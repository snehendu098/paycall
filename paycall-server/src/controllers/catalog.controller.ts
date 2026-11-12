import type { DB } from '../db'
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { endpoints, sellers } from '../db/schema'
import { factory } from '../lib/factory'

const fields = { id: endpoints.id, name: endpoints.name, description: endpoints.description, category: endpoints.category, price: endpoints.price, pricing: endpoints.pricing, maxAmount: endpoints.maxAmount, passSeconds: endpoints.passSeconds, verified: endpoints.verified, seller: sellers.name, sellerId: sellers.id, mode: endpoints.mode, base: endpoints.upstreamUrl, routes: endpoints.routes }
// hosted listed only once a route passed the probe
const listed = or(eq(endpoints.mode, 'proxy'), sql`${endpoints.routes} @> '[{"probe":{"ok":true}}]'`)

async function listings(db: DB, origin: string, where: SQL | undefined, docs = false) {
  const rows = await db
    .select({ ...fields, ...(docs && { docs: endpoints.docs }) })
    .from(endpoints)
    .innerJoin(sellers, eq(sellers.id, endpoints.sellerId))
    .where(and(listed, where))
    .orderBy(desc(endpoints.verified), desc(endpoints.createdAt))
    .limit(50) // ponytail: ilike scan, pg_trgm/fts when catalog > ~10k rows
  // proxy upstream stays private; hosted: direct urls of ok routes, `:param` kept as template
  return rows.map(({ base, routes, ...r }) =>
    r.mode === 'hosted'
      ? { ...r, url: base, routes: (routes ?? []).filter((x) => x.probe?.ok).map(({ probe: _, ...x }) => ({ ...x, url: base + x.path })) }
      : { ...r, url: `${origin}/p/${r.id}` },
  )
}
export type Listing = Awaited<ReturnType<typeof listings>>[number]

export const searchCatalog = (db: DB, origin: string, q = '') => {
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
  return listings(db, origin, q ? or(ilike(endpoints.name, like), ilike(endpoints.description, like), ilike(endpoints.category, like), ilike(sellers.name, like)) : undefined)
}
export const getListing = async (db: DB, origin: string, id: string) => (await listings(db, origin, eq(endpoints.id, id), true))[0] as (Listing & { docs: string }) | undefined

// public discovery: what agents can pay for
export const search = factory.createHandlers(async (c) => c.json(await searchCatalog(c.var.db, new URL(c.req.url).origin, c.req.query('q')?.slice(0, 100))))
export const get = factory.createHandlers(async (c) => {
  const l = await getListing(c.var.db, new URL(c.req.url).origin, c.req.param('id')!)
  if (!l) throw new HTTPException(404, { message: 'unknown listing' })
  return c.json(l)
})

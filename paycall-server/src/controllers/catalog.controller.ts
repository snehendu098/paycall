import type { DB } from '../db'
import { desc, eq, ilike, or } from 'drizzle-orm'
import { endpoints, sellers } from '../db/schema'
import { factory } from '../lib/factory'

export const searchCatalog = async (db: DB, origin: string, q = '') => {
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
  const rows = await db
    .select({ id: endpoints.id, name: endpoints.name, description: endpoints.description, category: endpoints.category, price: endpoints.price, pricing: endpoints.pricing, maxAmount: endpoints.maxAmount, passSeconds: endpoints.passSeconds, verified: endpoints.verified, seller: sellers.name, sellerId: sellers.id })
    .from(endpoints)
    .innerJoin(sellers, eq(sellers.id, endpoints.sellerId))
    .where(q ? or(ilike(endpoints.name, like), ilike(endpoints.description, like), ilike(endpoints.category, like), ilike(sellers.name, like)) : undefined)
    .orderBy(desc(endpoints.verified), desc(endpoints.createdAt))
    .limit(50) // ponytail: ilike scan, pg_trgm/fts when catalog > ~10k rows
  return rows.map((r) => ({ ...r, url: `${origin}/p/${r.id}` }))
}

// public discovery: what agents can pay for
export const search = factory.createHandlers(async (c) => c.json(await searchCatalog(c.var.db, new URL(c.req.url).origin, c.req.query('q')?.slice(0, 100))))

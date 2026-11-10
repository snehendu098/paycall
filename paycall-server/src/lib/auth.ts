import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { owners, sellers } from '../db/schema'
import type { AppEnv, Role } from '../types'
import { randomId, sha256 } from './util'

export const newApiKey = (role: Role) => randomId(`pc_${role}`, 24)

const unauthorized = () => new HTTPException(401, { message: 'invalid api key' })

export const auth = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    // ?key= fallback: EventSource can't send headers
    const key = c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? c.req.query('key')
    const role = roles.find((r) => key?.startsWith(`pc_${r}_`))
    if (!key || !role) throw unauthorized()

    const hash = await sha256(key)
    const cacheKey = `apikey:${hash}`
    let id = await c.env.KV.get(cacheKey)
    if (!id) {
      const [row] =
        role === 'owner'
          ? await c.var.db.select({ id: owners.id }).from(owners).where(eq(owners.apiKeyHash, hash))
          : await c.var.db.select({ id: sellers.id }).from(sellers).where(eq(sellers.apiKeyHash, hash))
      if (!row) throw unauthorized()
      id = row.id
      await c.env.KV.put(cacheKey, id, { expirationTtl: 300 })
    }

    c.set('principal', { role, id })
    await next()
  })

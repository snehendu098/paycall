import { zValidator } from '@hono/zod-validator'
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { agents, deviceLogins } from '../db/schema'
import { factory } from '../lib/factory'
import { randomId, sha256, zMicros } from '../lib/util'
import { Voucher } from '../lib/voucher'

const TTL_S = 600
const ABC = 'BCDFGHJKLMNPQRSTVWXZ' // no vowels → no words, no 0/O 1/I mixups

// 8 letters, rejection sampling → no modulo bias. 20^8 ≈ 2.6e10 guesses, 10 min ttl, owner-auth to guess
export function userCode() {
  let s = ''
  while (s.length < 8) for (const b of crypto.getRandomValues(new Uint8Array(16))) if (b < 240 && s.length < 8) s += ABC[b % 20]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

// user may type lowercase / no dash / spaces
export const normalizeCode = (raw: string) => {
  const s = raw.toUpperCase().replace(/[^A-Z]/g, '')
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null
}

const pending = (code: string) =>
  and(eq(deviceLogins.userCode, code), isNull(deviceLogins.ownerId), gt(deviceLogins.expiresAt, sql`now()`))

const codeParam = (raw: string | undefined) => {
  const code = raw && normalizeCode(raw)
  if (!code) throw new HTTPException(404, { message: 'unknown or expired code' })
  return code
}

// public: cli starts login with its locally made pubkey
export const start = factory.createHandlers(
  zValidator('json', z.object({ pubkey: Voucher.shape.payer, name: z.string().trim().min(1).max(64), replaces: Voucher.shape.payer.optional() })),
  async (c) => {
    const db = c.var.db
    await db.delete(deviceLogins).where(lt(deviceLogins.expiresAt, sql`now()`)) // lazy gc
    const deviceCode = randomId('dc', 24)
    const [row] = await db
      .insert(deviceLogins)
      .values({ ...c.req.valid('json'), deviceHash: await sha256(deviceCode), userCode: userCode(), expiresAt: sql`now() + make_interval(secs => ${TTL_S})` })
      .returning({ userCode: deviceLogins.userCode })
    return c.json({ deviceCode, userCode: row!.userCode, verificationUri: `${c.env.DASHBOARD_ORIGIN}/app/connect`, expiresIn: TTL_S, interval: 2 }, 201)
  },
)

// public: cli polls with its secret device code
export const poll = factory.createHandlers(zValidator('json', z.object({ deviceCode: z.string().min(1).max(100) })), async (c) => {
  const db = c.var.db
  const hash = await sha256(c.req.valid('json').deviceCode)
  const [row] = await db.select().from(deviceLogins).where(eq(deviceLogins.deviceHash, hash))
  if (row?.ownerId) {
    await db.delete(deviceLogins).where(eq(deviceLogins.deviceHash, hash)) // one shot
    return c.json({ status: 'approved' as const })
  }
  if (!row || row.expiresAt < new Date()) return c.json({ status: 'expired' as const }, 410)
  return c.json({ status: 'pending' as const })
})

// owner: what am i approving?
export const lookup = factory.createHandlers(async (c) => {
  const [row] = await c.var.db
    .select({ userCode: deviceLogins.userCode, name: deviceLogins.name, pubkey: deviceLogins.pubkey, replaces: deviceLogins.replaces, expiresAt: deviceLogins.expiresAt })
    .from(deviceLogins)
    .where(pending(codeParam(c.req.param('code'))))
  if (!row) throw new HTTPException(404, { message: 'unknown or expired code' })
  return c.json(row)
})

// owner: approve → agent registered under owner, old key paused
export const approve = factory.createHandlers(zValidator('json', z.object({ maxPrice: zMicros.optional() })), async (c) => {
  const ownerId = c.var.principal.id
  const { maxPrice } = c.req.valid('json')
  const code = codeParam(c.req.param('code'))
  const agent = await c.var.db.transaction(async (tx) => {
    // claim atomically: second approve / expired → no row
    const [row] = await tx.update(deviceLogins).set({ ownerId, maxPrice }).where(pending(code)).returning()
    if (!row) throw new HTTPException(404, { message: 'unknown or expired code' })
    const [a] = await tx
      .insert(agents)
      .values({ pubkey: row.pubkey, name: row.name, ownerId, ...(maxPrice !== undefined && { maxPrice }) })
      .returning()
    if (row.replaces) await tx.update(agents).set({ paused: true }).where(and(eq(agents.pubkey, row.replaces), eq(agents.ownerId, ownerId)))
    return a
  })
  return c.json(agent, 201)
})

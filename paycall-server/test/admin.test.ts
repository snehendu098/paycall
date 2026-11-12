// needs local pg: DATABASE_URL, migrations applied
// dashboard admin: session email in ADMIN_EMAILS → /api/pc/admin/* forwarded to /admin/* with ADMIN_KEY, others 403
import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test'
import { getMigrations } from 'better-auth/db/migration'
import { eq, sql } from 'drizzle-orm'
import { makeAuth } from '../src/dashboard'
import { connect } from '../src/db'
import { agents, disputes, endpoints, entries, owners, sellers } from '../src/db/schema'
import worker from '../src/index'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
const O = 'http://localhost'
const env = { HYPERDRIVE: { connectionString }, PAYCALL_SERVICE_KEY: 'svc_test_key', ADMIN_KEY: 'adm_test_key', ADMIN_EMAILS: ' Boss@x.io , other@x.io', DASHBOARD_ORIGIN: O, BETTER_AUTH_SECRET: 'x'.repeat(32), RESEND_API_KEY: '' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const call = (cookie: string, path: string, body?: unknown) =>
  worker.fetch(new Request(`${O}${path}`, { method: body ? 'POST' : 'GET', headers: { origin: O, cookie, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }), env, ctx)

async function login(email: string) {
  const log = spyOn(console, 'log')
  await call('', '/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' })
  const otp = String(log.mock.calls.find((c) => String(c[0]).startsWith(`[otp] ${email}`))![0]).split('→ ')[1]!
  log.mockRestore()
  const r = await call('', '/api/auth/sign-in/email-otp', { email, otp })
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

beforeAll(async () => {
  const { auth, end } = makeAuth(env)
  await (await getMigrations(auth.options)).runMigrations()
  await end()
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.execute(sql`truncate "user", "session", "verification" cascade`)
})
afterAll(close)

test('admin bff: non-admin 403, admin lists queue + decides escalated dispute', async () => {
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 0 })
  await db.insert(sellers).values({ id: 'sel_1', name: 'DataMart', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
  await db.insert(agents).values({ pubkey: 'pk_bot', ownerId: 'own_1', name: 'bot' })
  await db.insert(endpoints).values({ id: 'ep_1', sellerId: 'sel_1', name: 'forecast', upstreamUrl: 'http://u', price: 100, pricing: 'token', maxAmount: 50_000 })
  const [ch] = await db.insert(entries).values({ type: 'charge', amount: 10_000, ownerId: 'own_1', sellerId: 'sel_1', ref: 'ch:t:1', resource: '/p/ep_1/v1?q=1', agentPubkey: 'pk_bot', units: 100, unit: 'token' }).returning()
  const [d] = await db.insert(disputes).values({ entryId: ch!.id, ownerId: 'own_1', sellerId: 'sel_1', amount: 10_000, reason: 'bad data', status: 'escalated', reply: 'was fine', decidedBy: 'seller', escalatedAt: new Date() }).returning()

  const nobody = await login('nobody@x.io')
  expect((await call('', '/api/pc/admin/disputes')).status).toBe(401)
  expect((await call(nobody, '/api/pc/admin/disputes')).status).toBe(403)
  expect((await call(nobody, `/api/pc/admin/disputes/${d!.id}`, { action: 'refund' })).status).toBe(403)
  expect((await call(nobody, `/api/pc/admin/disputes/${d!.id}`)).status).toBe(403)
  expect(await (await call(nobody, '/api/pc/me')).json()).toEqual({ admin: false })

  const boss = await login('boss@x.io')
  expect(await (await call(boss, '/api/pc/me')).json()).toEqual({ admin: true })
  expect((await call(boss, '/api/pc/admin/owners/me')).status).toBe(404) // not allowlisted
  const q = (await (await call(boss, '/api/pc/admin/disputes')).json()) as { id: number; resource: string }[]
  expect(q).toMatchObject([{ id: d!.id, resource: '/p/ep_1/v1?q=1', endpoint: 'forecast', ownerEmail: 'o@x.io' }])
  const one = await call(boss, `/api/pc/admin/disputes/${d!.id}`)
  expect(one.status).toBe(200)
  expect(await one.json()).toMatchObject({
    id: d!.id, status: 'escalated', reason: 'bad data', reply: 'was fine', ownerEmail: 'o@x.io', agentName: 'bot', agentPubkey: 'pk_bot',
    seller: 'DataMart', sellerPaypal: 's@x.io', sellerId: 'sel_1', endpointId: 'ep_1', endpoint: 'forecast', pricing: 'token', price: 100, maxAmount: 50_000, charged: 10_000, units: 100, unit: 'token',
  })
  expect((await call(boss, '/api/pc/admin/disputes/999999')).status).toBe(404)
  const r = await call(boss, `/api/pc/admin/disputes/${d!.id}`, { action: 'refund', reply: 'upstream broke' })
  expect(r.status).toBe(200)
  expect(await r.json()).toMatchObject({ status: 'refunded', decidedBy: 'admin', reply: 'was fine', adminNote: 'upstream broke' })
  expect((await db.select().from(owners).where(eq(owners.id, 'own_1')))[0]!.balance).toBe(10_000)
  expect(await (await call(boss, '/api/pc/admin/disputes')).json()).toEqual([])
  expect(await (await call(boss, `/api/pc/admin/disputes/${d!.id}`)).json()).toMatchObject({ status: 'refunded', adminNote: 'upstream broke' }) // any status

  const s = (await (await call(boss, '/api/pc/admin/stats')).json()) as Record<string, number>
  expect(s).toMatchObject({ owners: 1, sellers: 1, charged: 10_000, refunded: 10_000, held: 0 })
  expect((await call(boss, '/api/pc/admin/endpoints')).status).toBe(200)
})

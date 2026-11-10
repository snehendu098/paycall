// needs local pg: DATABASE_URL, migrations applied (better auth tables made here)
// dashboard path: otp sign-in → session cookie → enable portal → api via session, no service key on client
import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test'
import { getMigrations } from 'better-auth/db/migration'
import { sql } from 'drizzle-orm'
import { makeAuth } from '../src/dashboard'
import { connect } from '../src/db'
import worker from '../src/index'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
const O = 'http://localhost'
const env = { HYPERDRIVE: { connectionString }, PAYCALL_SERVICE_KEY: 'svc_test_key', DASHBOARD_ORIGIN: O, BETTER_AUTH_SECRET: 'x'.repeat(32), RESEND_API_KEY: '' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
let cookie = ''
const call = (path: string, body?: unknown) =>
  worker.fetch(
    new Request(`${O}${path}`, { method: body ? 'POST' : 'GET', headers: { origin: O, cookie, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }),
    env,
    ctx,
  )

beforeAll(async () => {
  const { auth, end } = makeAuth(env)
  await (await getMigrations(auth.options)).runMigrations()
  await end()
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.execute(sql`truncate "user", "session", "verification" cascade`)
})
afterAll(close)

test('otp → cookie → enable buyer → session-backed api; allowlist + 401', async () => {
  expect((await call('/api/pc/buyer/owners/me')).status).toBe(401)

  const log = spyOn(console, 'log')
  expect((await call('/api/auth/email-otp/send-verification-otp', { email: 'a@x.io', type: 'sign-in' })).status).toBe(200)
  const otp = String(log.mock.calls.find((c) => String(c[0]).startsWith('[otp] a@x.io'))![0]).split('→ ')[1]!
  log.mockRestore()

  const signIn = await call('/api/auth/sign-in/email-otp', { email: 'a@x.io', otp })
  expect(signIn.status).toBe(200)
  cookie = signIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')

  expect((await call('/api/pc/buyer/owners/me')).status).toBe(404) // not enabled yet
  const { ownerId } = (await (await call('/api/pc/enable', { role: 'buyer' })).json()) as { ownerId: string }
  expect(ownerId).toStartWith('own_')
  expect(((await (await call('/api/pc/enable', { role: 'buyer' })).json()) as { ownerId: string }).ownerId).toBe(ownerId) // idempotent

  const me = await call('/api/pc/buyer/owners/me')
  expect(me.status).toBe(200)
  expect(((await me.json()) as { owner: { id: string } }).owner.id).toBe(ownerId)
  expect((await call('/api/pc/buyer/admin/settle')).status).toBe(404) // not allowlisted
  expect((await call('/api/pc/buyer/../admin')).status).toBe(404)
  expect((await call('/api/pc/seller/sellers/me')).status).toBe(404) // seller not enabled
  expect((await call('/api/pc/enable', { role: 'seller', name: 'S', paypalEmail: 'bad' })).status).toBe(400)
})

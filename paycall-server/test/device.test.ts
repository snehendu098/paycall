// needs local pg: DATABASE_URL, migrations applied
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { normalizeCode, userCode } from '../src/controllers/device.controller'
import { connect } from '../src/db'
import { agents, deviceLogins, owners } from '../src/db/schema'
import worker from '../src/index'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
afterAll(close)

const SK = 'svc_test_key'
const env = { HYPERDRIVE: { connectionString }, PAYCALL_SERVICE_KEY: SK, DASHBOARD_ORIGIN: 'http://dash.test' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const call = (method: string, path: string, body?: unknown, as?: string) =>
  worker.fetch(
    new Request(`http://pc.test${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(as && { authorization: `Bearer ${SK}`, 'x-paycall-as': as }) },
      body: body && JSON.stringify(body),
    }),
    env,
    ctx,
  )
const PK = 'A'.repeat(43), OLD = 'B'.repeat(43)
const startLogin = async (replaces?: string) =>
  (await (await call('POST', '/device', { pubkey: PK, name: 'claude', replaces })).json()) as { deviceCode: string; userCode: string; verificationUri: string }
const poll = (deviceCode: string) => call('POST', '/device/token', { deviceCode })

beforeEach(async () => {
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, device_logins cascade`)
  await db.insert(owners).values([{ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1' }, { id: 'own_2', email: 'p@x.io', apiKeyHash: 'h2' }])
})

test('codes: format + normalize', () => {
  expect(userCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/)
  expect(normalizeCode(' wdjb mjht ')).toBe('WDJB-MJHT')
  expect(normalizeCode('WDJ')).toBeNull()
})

test('start → pending → approve → approved once, agent registered, old key paused', async () => {
  await db.insert(agents).values({ pubkey: OLD, ownerId: 'own_1', name: 'old' })
  const d = await startLogin(OLD)
  expect(d.verificationUri).toBe('http://dash.test/app/connect')
  expect(((await (await poll(d.deviceCode)).json()) as { status: string }).status).toBe('pending')

  const look = await call('GET', `/device/${d.userCode.toLowerCase().replace('-', '')}`, undefined, 'owner:own_1')
  expect(((await look.json()) as { pubkey: string }).pubkey).toBe(PK)

  expect((await call('POST', `/device/${d.userCode}/approve`, { maxPrice: 50_000 }, 'owner:own_1')).status).toBe(201)
  const [a] = await db.select().from(agents).where(eq(agents.pubkey, PK))
  expect(a).toMatchObject({ ownerId: 'own_1', name: 'claude', maxPrice: 50_000, paused: false })
  expect((await db.select().from(agents).where(eq(agents.pubkey, OLD)))[0]!.paused).toBe(true)

  expect(((await (await poll(d.deviceCode)).json()) as { status: string }).status).toBe('approved')
  expect((await poll(d.deviceCode)).status).toBe(410) // one shot
})

test('second approve, expired code, wrong device code, no auth → rejected', async () => {
  const d = await startLogin()
  expect((await call('POST', `/device/${d.userCode}/approve`, {}, 'owner:own_1')).status).toBe(201)
  expect((await call('POST', `/device/${d.userCode}/approve`, {}, 'owner:own_2')).status).toBe(404) // already claimed
  expect((await call('GET', `/device/${d.userCode}`)).status).toBe(401)
  expect((await poll('dc_wrong')).status).toBe(410)

  await db.execute(sql`truncate device_logins`)
  const e = await startLogin()
  await db.update(deviceLogins).set({ expiresAt: sql`now() - interval '1 second'` })
  expect((await call('POST', `/device/${e.userCode}/approve`, {}, 'owner:own_1')).status).toBe(404)
  expect((await poll(e.deviceCode)).status).toBe(410)
})

test("replaces can't pause another owner's agent", async () => {
  await db.insert(agents).values({ pubkey: OLD, ownerId: 'own_2', name: 'theirs' })
  const d = await startLogin(OLD)
  await call('POST', `/device/${d.userCode}/approve`, {}, 'owner:own_1')
  expect((await db.select().from(agents).where(eq(agents.pubkey, OLD)))[0]!.paused).toBe(false)
})

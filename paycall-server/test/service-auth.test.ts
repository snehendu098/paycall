// needs local pg: DATABASE_URL, migrations applied
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { owners, sellers } from '../src/db/schema'
import worker from '../src/index'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
afterAll(close)

const SK = 'svc_test_key'
const env = { HYPERDRIVE: { connectionString }, PAYCALL_SERVICE_KEY: SK } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const get = (path: string, key: string, as?: string) =>
  worker.fetch(new Request(`http://pc.test${path}`, { headers: { authorization: `Bearer ${key}`, ...(as && { 'x-paycall-as': as }) } }), env, ctx)

beforeEach(async () => {
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1' })
  await db.insert(sellers).values({ id: 'sel_1', name: 'S', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
})

test('service key acts as owner / seller', async () => {
  const o = await get('/owners/me', SK, 'owner:own_1')
  expect(o.status).toBe(200)
  expect(((await o.json()) as { owner: { id: string } }).owner.id).toBe('own_1')
  expect((await get('/sellers/me', SK, 'seller:sel_1')).status).toBe(200)
})

test('wrong key, missing act-as, role mismatch → 401', async () => {
  expect((await get('/owners/me', 'svc_wrong', 'owner:own_1')).status).toBe(401)
  expect((await get('/owners/me', SK)).status).toBe(401)
  expect((await get('/owners/me', SK, 'seller:sel_1')).status).toBe(401) // seller can't hit owner route
})

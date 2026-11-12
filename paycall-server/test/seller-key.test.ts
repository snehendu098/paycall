// needs local pg. seller key: named rotate shows hint, revoke kills key
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { sellers } from '../src/db/schema'
import worker from '../src/index'
import { sha256 } from '../src/lib/util'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
afterAll(close)
const store = new Map<string, string>()
const KV = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v), delete: async (k: string) => void store.delete(k) }
const env = { HYPERDRIVE: { connectionString }, KV, BETTER_AUTH_SECRET: 'test' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const call = (key: string, method: string, path: string, body?: unknown) =>
  worker.fetch(new Request(`http://localhost${path}`, { method, body: body && JSON.stringify(body), headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' } }), env, ctx)

beforeEach(async () => {
  await db.execute(sql`truncate sellers cascade`)
  await db.insert(sellers).values({ id: 'sel_1', name: 'S', paypalEmail: 's@x.io', apiKeyHash: await sha256('pc_seller_old') })
})

test('named key: hint on me, old key dead; revoke kills new key', async () => {
  expect((await call('pc_seller_old', 'POST', '/sellers/me/key', {})).status).toBe(400) // name required
  const r = await call('pc_seller_old', 'POST', '/sellers/me/key', { name: ' test-server ' })
  expect(r.status).toBe(201)
  const { apiKey, keyHint } = (await r.json()) as { apiKey: string; keyHint: string }
  expect(keyHint).toBe(`${apiKey.slice(0, 14)}…${apiKey.slice(-4)}`)
  expect((await call('pc_seller_old', 'GET', '/sellers/me')).status).toBe(401)
  const me = (await (await call(apiKey, 'GET', '/sellers/me')).json()) as { seller: Record<string, unknown> }
  expect(me.seller).toMatchObject({ keyName: 'test-server', keyHint })
  expect(me.seller.apiKeyHash).toBeUndefined()

  expect((await call(apiKey, 'DELETE', '/sellers/me/key')).status).toBe(200)
  expect((await call(apiKey, 'GET', '/sellers/me')).status).toBe(401)
  const [s] = await db.select().from(sellers)
  expect(s).toMatchObject({ keyName: null, keyHint: null, keyCreatedAt: null })
})

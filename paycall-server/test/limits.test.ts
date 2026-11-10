// needs local pg: DATABASE_URL, migrations applied
// agent limits: allowlist, per-agent daily cap, human approval; public catalog
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { agents, approvals, endpoints, owners, sellers } from '../src/db/schema'
import worker from '../src/index'
import { b64url } from '../src/lib/util'
import { signVoucher } from '../src/lib/voucher'
import { NETWORK, SCHEME } from '../src/payments'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
const upstream = Bun.serve({ port: 0, fetch: (r) => Response.json({ ok: 1, key: r.headers.get('x-api-key') }) })
afterAll(async () => {
  upstream.stop()
  await close()
})

const keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
const pubkey = b64url(new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer))
const PRICE = 10_000
const SK = 'svc_test_key'
const env = { HYPERDRIVE: { connectionString }, PAYCALL_SERVICE_KEY: SK, BETTER_AUTH_SECRET: 'test-secret', ADMIN_KEY: 'adm' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const fetchW = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://localhost${path}`, init), env, ctx)
const owner = (path: string, body?: unknown) =>
  fetchW(path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${SK}`, 'x-paycall-as': 'owner:own_1', 'content-type': 'application/json' }, body: body && JSON.stringify(body) })

let seq = 0
let last: Response
let channelId = ''
async function pay() {
  seq++
  const accepted = { scheme: SCHEME, network: NETWORK, amount: String(PRICE), asset: 'USD', payTo: 'sel_1' }
  const payload = await signVoucher(
    { channelId, payer: pubkey, payTo: 'sel_1', cumulativeAmount: String(seq * PRICE), currency: 'USD', seq, expiry: (Date.now() / 1000 + 60) | 0 },
    keys.privateKey,
  )
  last = await fetchW('/p/ep_1/x', { headers: { 'PAYMENT-SIGNATURE': btoa(JSON.stringify({ x402Version: 2, accepted, payload })) } })
  if (last.status !== 200) seq-- // failed voucher not consumed
  return last.status === 200 ? 'ok' : JSON.parse(atob(last.headers.get('payment-required')!)).error
}
const setAgent = (v: Partial<typeof agents.$inferInsert>) => db.update(agents).set(v).where(eq(agents.pubkey, pubkey))

beforeEach(async () => {
  seq = 0
  channelId = crypto.randomUUID()
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 1_000_000, dailyCap: 1_000_000 })
  await db.insert(agents).values({ pubkey, ownerId: 'own_1', name: 'bot' })
  await db.insert(sellers).values({ id: 'sel_1', name: 'WeatherCo', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
  await db.insert(endpoints).values({ id: 'ep_1', sellerId: 'sel_1', name: 'forecast', description: '7 day forecast', category: 'weather', upstreamUrl: `http://localhost:${upstream.port}`, price: PRICE })
})

test('allowlist + per-agent daily cap', async () => {
  await setAgent({ allowedSellers: ['sel_other'] })
  expect(await pay()).toBe('seller_not_allowed')
  await setAgent({ allowedSellers: ['sel_1'], dailyCap: 15_000 })
  expect(await pay()).toBe('ok')
  expect(await pay()).toBe('agent_daily_cap_exceeded')
})

test('approval: held → one pending row → approve → one call passes → held again', async () => {
  await setAgent({ approveAbove: 5_000 })
  expect(await pay()).toBe('approval_required')
  expect(await pay()).toBe('approval_required') // retry, no dup row
  const list = (await (await owner('/approvals')).json()) as { id: number; agentName: string; sellerName: string; amount: number; resource: string }[]
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ agentName: 'bot', sellerName: 'WeatherCo', amount: PRICE, resource: 'http://localhost/p/ep_1/x' })

  expect((await owner(`/approvals/${list[0]!.id}`, { approve: true })).status).toBe(200)
  expect((await owner(`/approvals/${list[0]!.id}`, { approve: false })).status).toBe(404) // already decided
  expect(await pay()).toBe('ok')
  expect(await pay()).toBe('approval_required') // approval single use
  expect((await db.select().from(approvals).where(eq(approvals.status, 'used'))).length).toBe(1)

  const [p] = (await (await owner('/approvals')).json()) as { id: number }[]
  await owner(`/approvals/${p!.id}`, { approve: false })
  expect(await pay()).toBe('approval_required') // deny → new pending on retry
})

test('catalog: public search', async () => {
  const all = (await (await fetchW('/catalog')).json()) as { url: string; seller: string }[]
  expect(all[0]).toMatchObject({ name: 'forecast', price: PRICE, seller: 'WeatherCo', sellerId: 'sel_1', url: 'http://localhost/p/ep_1', category: 'weather' })
  expect(await (await fetchW('/catalog?q=FORECAST')).json()).toHaveLength(1)
  expect(await (await fetchW('/catalog?q=weatherco')).json()).toHaveLength(1)
  expect(await (await fetchW('/catalog?q=flights')).json()).toHaveLength(0)
  expect(await (await fetchW('/catalog?q=%25')).json()).toHaveLength(0) // % escaped
})

test('upstream auth: sealed, never returned, injected over caller header; admin verified badge', async () => {
  const seller = (method: string, path: string, body?: unknown) =>
    fetchW(path, { method, headers: { authorization: `Bearer ${SK}`, 'x-paycall-as': 'seller:sel_1', 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
  expect((await seller('PATCH', '/endpoints/ep_1', { upstreamAuth: 'x-api-key: bad\r\nevil: 1' })).status).toBe(400)
  const ep = (await (await seller('PATCH', '/endpoints/ep_1', { upstreamAuth: 'x-api-key: sk_live_123' })).json()) as Record<string, unknown>
  expect(ep.hasAuth).toBe(true)
  expect('upstreamAuth' in ep).toBe(false)
  const [row] = await db.select().from(endpoints).where(eq(endpoints.id, 'ep_1'))
  expect(row!.upstreamAuth).not.toContain('sk_live_123') // sealed at rest
  const listed = JSON.stringify(await (await seller('GET', '/endpoints')).json())
  expect(listed).not.toContain(row!.upstreamAuth!)

  expect(await pay()).toBe('ok')
  expect(((await last.json()) as { key: string }).key).toBe('sk_live_123')
  expect(((await (await seller('PATCH', '/endpoints/ep_1', { upstreamAuth: null })).json()) as { hasAuth: boolean }).hasAuth).toBe(false)

  const adm = (b: unknown, k = 'adm') => fetchW('/admin/endpoints/ep_1/verified', { method: 'POST', headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' }, body: JSON.stringify(b) })
  expect((await adm({ verified: true }, 'nope')).status).toBe(401)
  expect((await adm({ verified: true })).status).toBe(200)
  const [l] = (await (await fetchW('/catalog')).json()) as { verified: boolean }[]
  expect(l!.verified).toBe(true)
})

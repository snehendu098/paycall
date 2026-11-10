// needs local pg. real sdk against in-process worker: passes, metering, receipts
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { createAgent, decodePaymentHeader, generateKey, verifyReceipt } from 'paycall-sdk'
import { connect } from '../src/db'
import { agents, endpoints, owners, sellers } from '../src/db/schema'
import worker from '../src/index'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
let hits = 0
const upstream = Bun.serve({ port: 0, fetch: () => (hits++, Response.json({ text: 'ok', usage: { output_tokens: 120 } })) })
afterAll(async () => {
  upstream.stop()
  await close()
})
const store = new Map<string, string>()
const KV = { get: async (k: string, t?: string) => (store.has(k) ? (t === 'json' ? JSON.parse(store.get(k)!) : store.get(k)) : null), put: async (k: string, v: string) => void store.set(k, v) }
const env = { HYPERDRIVE: { connectionString }, KV, BETTER_AUTH_SECRET: 'test' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const inProc = ((i: string | URL | Request, init?: RequestInit) => worker.fetch(new Request(i, init), env, ctx)) as typeof fetch
const balance = async () => (await db.select().from(owners).where(eq(owners.id, 'own_1')))[0]!.balance

const k = await generateKey()
beforeEach(async () => {
  hits = 0
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 1_000_000, dailyCap: 1_000_000 })
  await db.insert(agents).values({ pubkey: k.pubkey, ownerId: 'own_1', name: 'bot', maxPrice: 100_000 })
  await db.insert(sellers).values({ id: 'sel_1', name: 'S', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
})

test('sdk: pass bought once, later calls ride free on identity', async () => {
  await db.insert(endpoints).values({ id: 'ep_p', sellerId: 'sel_1', name: 'p', upstreamUrl: `http://localhost:${upstream.port}`, price: 50_000, pricing: 'pass', passSeconds: 3600 })
  const agent = await createAgent(k.privateKey, { fetch: inProc })
  for (let i = 0; i < 3; i++) expect((await agent.fetch('http://localhost/p/ep_p/x')).status).toBe(200)
  expect(hits).toBe(3)
  expect(await balance()).toBe(950_000)
  // fresh agent (new process): learns pass from 402, retries with identity, no second payment
  const again = await createAgent(k.privateKey, { fetch: inProc })
  expect((await again.fetch('http://localhost/p/ep_p/y')).status).toBe(200)
  expect(await balance()).toBe(950_000)
})

test('sdk: metered spend = kept amount; receipt verifies via jwks', async () => {
  await db.insert(endpoints).values({ id: 'ep_m', sellerId: 'sel_1', name: 'm', upstreamUrl: `http://localhost:${upstream.port}`, price: 100, pricing: 'token', maxAmount: 50_000 })
  const agent = await createAgent(k.privateKey, { fetch: inProc })
  const res = await agent.fetch('http://localhost/p/ep_m')
  expect(res.status).toBe(200)
  expect(agent.spent).toBe(12_000)
  expect(await balance()).toBe(988_000)
  const receipt = decodePaymentHeader(res.headers.get('payment-response')).receipt
  expect(await verifyReceipt(receipt, { fetch: inProc })).toMatchObject({ amount: '12000', units: 120, payer: k.pubkey })
  expect(await verifyReceipt(receipt.slice(0, -4) + 'AAAA', { fetch: inProc })).toBeUndefined()
})

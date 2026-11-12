// needs local pg. self-hosted time pass: /settle extra.pass → /passes/check
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { agents, owners, sellers } from '../src/db/schema'
import worker from '../src/index'
import { b64url, sha256 } from '../src/lib/util'
import { signVoucher } from '../src/lib/voucher'
import { NETWORK, SCHEME } from '../src/payments'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
afterAll(close)
const store = new Map<string, string>()
const KV = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) }
const env = { HYPERDRIVE: { connectionString }, KV, BETTER_AUTH_SECRET: 'test' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

const KEY = 'pc_seller_passtest'
const keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
const pubkey = b64url(new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer))
const URL_ = 'https://api.seller.dev/data'

beforeEach(async () => {
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 25_000, dailyCap: 1_000_000 })
  await db.insert(agents).values({ pubkey, ownerId: 'own_1', name: 'bot' })
  await db.insert(sellers).values({ id: 'sel_1', name: 'S', paypalEmail: 's@x.io', apiKeyHash: await sha256(KEY) })
})

const post = (path: string, body: unknown) =>
  worker.fetch(new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body), headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' } }), env, ctx)

async function settle(pass?: unknown) {
  const req = { scheme: SCHEME, network: NETWORK, amount: '10000', asset: 'USD', payTo: 'sel_1' }
  const payload = await signVoucher(
    { channelId: crypto.randomUUID(), payer: pubkey, payTo: 'sel_1', cumulativeAmount: '10000', currency: 'USD', seq: 1, expiry: (Date.now() / 1000 + 60) | 0 },
    keys.privateKey,
  )
  return post('/settle', { x402Version: 2, paymentPayload: { x402Version: 2, accepted: req, payload }, paymentRequirements: { ...req, extra: { pass } } })
}
const identity = async () => {
  const ts = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomUUID()
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(`paycall-agent:${ts}:${nonce}:GET:${URL_}`)))
  return `${pubkey}.${ts}.${nonce}.${b64url(sig)}`
}
const check = async (identity: string, scope = '/data') => (await post('/passes/check', { identity, method: 'GET', url: URL_, scope })).json()

test('no pass → invalid', async () => {
  expect(await check(await identity())).toEqual({ valid: false })
})

test('settle w/ pass → check valid; replay, other scope, paused → invalid', async () => {
  const r = await (await settle({ seconds: 60, scope: '/data' })).json()
  expect(r).toMatchObject({ success: true, payer: pubkey })
  expect(new Date(r.pass.expiresAt).getTime()).toBeGreaterThan(Date.now() + 50_000)

  const id = await identity()
  expect(await check(id)).toMatchObject({ valid: true, payer: pubkey, expiresAt: r.pass.expiresAt })
  expect(await check(id)).toEqual({ valid: false }) // nonce burnt
  expect(await check(await identity(), '/other')).toEqual({ valid: false })
  await db.update(agents).set({ paused: true }).where(eq(agents.pubkey, pubkey))
  expect(await check(await identity())).toEqual({ valid: false })
})

test('bad pass extra → 400, no charge', async () => {
  expect((await settle({ seconds: 31 * 86400, scope: '/data' })).status).toBe(400)
  expect((await settle({ seconds: 60 })).status).toBe(400)
  expect((await db.select().from(owners))[0]!.balance).toBe(25_000)
})

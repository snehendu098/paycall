// needs local pg: DATABASE_URL, migrations applied
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { agents, endpoints, owners, sellers } from '../src/db/schema'
import worker from '../src/index'
import { b64url } from '../src/lib/util'
import { signVoucher } from '../src/lib/voucher'
import { NETWORK, SCHEME } from '../src/payments'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
const upstream = Bun.serve({
  port: 0,
  fetch: (req) => {
    const u = new URL(req.url)
    if (u.pathname === '/boom') return new Response('nope', { status: 500 })
    return Response.json({ path: u.pathname, q: u.searchParams.get('q'), auth: req.headers.get('authorization') })
  },
})
afterAll(async () => {
  upstream.stop()
  await close()
})

const keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
const pubkey = b64url(new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer))
const channelId = crypto.randomUUID()
const PRICE = 10_000
const env = { HYPERDRIVE: { connectionString } } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const b64 = (o: unknown) => btoa(JSON.stringify(o))
const unb64 = (s: string | null) => JSON.parse(atob(s!))

beforeEach(async () => {
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 25_000, dailyCap: 1_000_000 })
  await db.insert(agents).values({ pubkey, ownerId: 'own_1', name: 'bot' })
  await db.insert(sellers).values({ id: 'sel_1', name: 'DataMart', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
  // direct insert: skips https-only rule
  await db.insert(endpoints).values({ id: 'ep_1', sellerId: 'sel_1', name: 'echo', upstreamUrl: `http://localhost:${upstream.port}`, price: PRICE })
})

async function voucherHeader(seq: number, cumulative: number) {
  const accepted = { scheme: SCHEME, network: NETWORK, amount: String(PRICE), asset: 'USD', payTo: 'sel_1' }
  const payload = await signVoucher(
    { channelId, payer: pubkey, payTo: 'sel_1', cumulativeAmount: String(cumulative), currency: 'USD', seq, expiry: (Date.now() / 1000 + 60) | 0 },
    keys.privateKey,
  )
  return b64({ x402Version: 2, accepted, payload })
}

const call = (path: string, sig?: string) =>
  worker.fetch(new Request(`http://localhost/p/ep_1${path}`, { headers: { authorization: 'Bearer secret', ...(sig && { 'PAYMENT-SIGNATURE': sig }) } }), env, ctx)
const balance = async () => (await db.select().from(owners).where(eq(owners.id, 'own_1')))[0].balance

test('unpaid → 402 + PAYMENT-REQUIRED', async () => {
  const res = await call('/x')
  expect(res.status).toBe(402)
  const pr = unb64(res.headers.get('payment-required'))
  expect(pr.error).toBe('payment_required')
  expect(pr.accepts[0]).toMatchObject({ scheme: SCHEME, amount: String(PRICE), payTo: 'sel_1', extra: { facilitator: 'http://localhost' } })
  expect(await res.json()).toEqual(pr)
})

test('paid → upstream body + PAYMENT-RESPONSE + debit', async () => {
  const res = await call('/a/b?q=1', await voucherHeader(1, PRICE))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ path: '/a/b', q: '1', auth: null })
  expect(unb64(res.headers.get('payment-response'))).toMatchObject({ success: true, payer: pubkey, network: NETWORK })
  expect(await balance()).toBe(15_000)
})

test('upstream 500 → passthrough, no charge', async () => {
  const res = await call('/boom', await voucherHeader(1, PRICE))
  expect(res.status).toBe(500)
  expect(await res.text()).toBe('nope')
  expect(await balance()).toBe(25_000)
})

test('replay → 402', async () => {
  const sig = await voucherHeader(1, PRICE)
  expect((await call('', sig)).status).toBe(200)
  const res = await call('', sig)
  expect(res.status).toBe(402)
  expect(unb64(res.headers.get('payment-required')).error).toBe('stale_voucher')
  expect(await balance()).toBe(15_000)
})

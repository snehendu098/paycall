// needs local pg: DATABASE_URL, migrations applied
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { agents, endpoints, entries, owners, sellers } from '../src/db/schema'
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
    if (u.pathname === '/llm') return Response.json({ text: 'hi', usage: { output_tokens: 300 } })
    if (u.pathname === '/slow') {
      // one event then hangs: only a client abort ends it
      const body = new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: { text: 'hello' } })}\n\n`)) })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    }
    if (u.pathname === '/sse') {
      const ev = (t: string) => `data: ${JSON.stringify({ delta: { text: t } })}\n\n`
      return new Response(ev('hello') + ev('world') + ev('again') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    }
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
const store = new Map<string, string>()
const KV = { get: async (k: string, t?: string) => (store.has(k) ? (t === 'json' ? JSON.parse(store.get(k)!) : store.get(k)) : null), put: async (k: string, v: string) => void store.set(k, v) }
const env = { HYPERDRIVE: { connectionString }, KV, BETTER_AUTH_SECRET: 'test' } as unknown as CloudflareBindings
const pending: Promise<unknown>[] = []
const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext
const settled = () => Promise.all(pending.splice(0))
const b64 = (o: unknown) => btoa(JSON.stringify(o))
const unb64 = (s: string | null) => JSON.parse(atob(s!))

beforeEach(async () => {
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 25_000, dailyCap: 1_000_000 })
  await db.insert(agents).values({ pubkey, ownerId: 'own_1', name: 'bot' })
  await db.insert(sellers).values({ id: 'sel_1', name: 'DataMart', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
  // direct insert: skips https-only rule
  await db.insert(endpoints).values({ id: 'ep_1', sellerId: 'sel_1', name: 'echo', upstreamUrl: `http://localhost:${upstream.port}`, price: PRICE })
})

async function voucherHeader(seq: number, cumulative: number, amount = PRICE) {
  const accepted = { scheme: SCHEME, network: NETWORK, amount: String(amount), asset: 'USD', payTo: 'sel_1' }
  const payload = await signVoucher(
    { channelId, payer: pubkey, payTo: 'sel_1', cumulativeAmount: String(cumulative), currency: 'USD', seq, expiry: (Date.now() / 1000 + 60) | 0 },
    keys.privateKey,
  )
  return b64({ x402Version: 2, accepted, payload })
}

const call = (path: string, sig?: string, h: Record<string, string> = {}) =>
  worker.fetch(new Request(`http://localhost/p/ep_1${path}`, { headers: { authorization: 'Bearer secret', ...(sig && { 'PAYMENT-SIGNATURE': sig }), ...h } }), env, ctx)
const setEp = (v: Partial<typeof endpoints.$inferInsert>) => db.update(endpoints).set(v).where(eq(endpoints.id, 'ep_1'))
const agentHeader = async (url: string, k = keys) => {
  const ts = Math.floor(Date.now() / 1000)
  const pk = b64url(new Uint8Array((await crypto.subtle.exportKey('raw', k.publicKey)) as ArrayBuffer))
  const nonce = crypto.randomUUID()
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', k.privateKey, new TextEncoder().encode(`paycall-agent:${ts}:${nonce}:GET:${url}`)))
  return { 'paycall-agent': `${pk}.${ts}.${nonce}.${b64url(sig)}` }
}
const refunds = async () => (await db.select().from(entries).where(eq(entries.type, 'refund'))).map((e) => e.amount)
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

test('retry same paid request → stored response replayed, charged once; altered voucher → 402', async () => {
  const sig = await voucherHeader(1, PRICE)
  const first = await call('/a', sig)
  expect(first.status).toBe(200)
  await settled()
  const again = await call('/a', sig)
  expect(again.status).toBe(200)
  expect(again.headers.get('paycall-replay')).toBe('1')
  expect(again.headers.get('payment-response')).toBe(first.headers.get('payment-response'))
  expect(await again.json()).toEqual({ path: '/a', q: null, auth: null })
  expect(await balance()).toBe(15_000)
  const forged = unb64(sig)
  forged.payload.expiry += 9 // same seq, sig no longer matches
  expect((await call('/a', b64(forged))).status).toBe(402)
  expect(await balance()).toBe(15_000)
})

test('metered per token: sign cap, charge reported usage, refund rest, signed receipt', async () => {
  await setEp({ pricing: 'token', price: 10, maxAmount: 10_000 }) // $0.00001/token, cap 1¢
  const pr = unb64((await call('/llm')).headers.get('payment-required'))
  expect(pr.accepts[0]).toMatchObject({ amount: '10000', extra: { pricing: { unit: 'token', rate: '10', max: '10000' } } })
  const res = await call('/llm', await voucherHeader(1, 10_000))
  expect(res.status).toBe(200)
  const pay = unb64(res.headers.get('payment-response'))
  expect(pay).toMatchObject({ amount: '3000', units: 300, refunded: '7000' })
  expect(await balance()).toBe(22_000)
  expect(await refunds()).toEqual([7_000])
  expect((await db.select().from(entries).where(eq(entries.type, 'charge')))[0]).toMatchObject({ units: 300, unit: 'token' })

  // receipt: EdDSA over header.payload, key from jwks
  const [h, p, s] = pay.receipt.split('.')
  const { keys: [jwk] } = (await (await worker.fetch(new Request('http://localhost/.well-known/jwks.json'), env, ctx)).json()) as { keys: JsonWebKey[] }
  const key = await crypto.subtle.importKey('jwk', jwk!, 'Ed25519', false, ['verify'])
  const fromB64 = (x: string) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
  expect(await crypto.subtle.verify('Ed25519', key, fromB64(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true)
  expect(JSON.parse(new TextDecoder().decode(fromB64(p)))).toMatchObject({ amount: '3000', units: 300, payer: pubkey, payTo: 'sel_1' })
})

test('metered sse per char: streams, counts, receipt event; cut at cap', async () => {
  await setEp({ pricing: 'char', price: 10, maxAmount: 10_000 })
  let res = await call('/sse', await voucherHeader(1, 10_000))
  let text = await res.text()
  expect(text).toContain('again')
  const ev = JSON.parse(text.split('event: paycall-receipt\ndata: ')[1]!.split('\n')[0]!)
  expect(ev).toMatchObject({ amount: '150', units: 15, cut: false, refunded: '9850' })
  expect(ev.receipt.split('.')).toHaveLength(3)
  expect(await balance()).toBe(25_000 - 150)

  await setEp({ price: 100, maxAmount: 1_000 }) // 10 chars max
  res = await call('/sse', await voucherHeader(2, 11_000, 1_000))
  text = await res.text()
  expect(text).toContain('world')
  expect(text).not.toContain('again')
  expect(JSON.parse(text.split('data: ').at(-1)!)).toMatchObject({ amount: '1000', units: 10, cut: true, refunded: '0' })
  expect(await balance()).toBe(25_000 - 150 - 1_000)
})

test('time pass: pay once, then signed identity rides free until expiry', async () => {
  await setEp({ pricing: 'pass', price: PRICE, passSeconds: 60 })
  const url = 'http://localhost/p/ep_1/a'
  expect(unb64((await call('/a', undefined, await agentHeader(url))).headers.get('payment-required')).accepts[0].extra.pass).toEqual({ seconds: 60 })
  const bought = await call('/a', await voucherHeader(1, PRICE))
  expect(unb64(bought.headers.get('payment-response')).pass.expiresAt).toBeTruthy()
  const h = await agentHeader(url)
  const free = await call('/a', undefined, h)
  expect(free.status).toBe(200)
  expect(unb64(free.headers.get('payment-response')).pass).toBeTruthy()
  expect((await call('/a', undefined, h)).status).toBe(402) // seen header replayed → nonce burnt
  const stranger = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
  expect((await call('/a', undefined, await agentHeader(url, stranger))).status).toBe(402)
  expect((await call('/b', undefined, await agentHeader(url))).status).toBe(402) // sig bound to url
  expect(await balance()).toBe(15_000)
})

test('metered sse: client abort mid-stream still refunds unused cap', async () => {
  await setEp({ pricing: 'char', price: 10, maxAmount: 10_000 })
  const res = await call('/slow', await voucherHeader(1, 10_000))
  const r = res.body!.getReader()
  expect(new TextDecoder().decode((await r.read()).value)).toContain('hello')
  await r.cancel() // client hangs up
  await settled()
  expect(await refunds()).toEqual([10_000 - 50]) // 5 chars × 10
  expect((await db.select().from(entries).where(eq(entries.type, 'charge')))[0]).toMatchObject({ units: 5, unit: 'char' })
})

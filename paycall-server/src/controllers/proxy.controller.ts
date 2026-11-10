import type { Context } from 'hono'
import { and, eq, gt, sql } from 'drizzle-orm'
import { agents, endpoints, passes } from '../db/schema'
import { demo } from '../demo'
import { refund } from '../ledger'
import { factory } from '../lib/factory'
import { cost, countBody, meterStream, type Unit } from '../lib/meter'
import { signReceipt, type Receipt } from '../lib/receipt'
import { unseal } from '../lib/seal'
import { sha256 } from '../lib/util'
import { verifyAgentHeader } from '../lib/voucher'
import { checkPayment, NETWORK, PaymentBody, SCHEME, settlePayment } from '../payments'
import { reloadAfterSettle } from '../topups'
import type { AppEnv } from '../types'

type Endpoint = typeof endpoints.$inferSelect
const b64json = (o: unknown) => btoa(JSON.stringify(o))
const DROP_REQ = /^(host|authorization|cookie|payment-.*|paycall-.*|cf-.*|x-forwarded-.*)$/i
const IDEM_TTL = 3600
const IDEM_MAX = 512 * 1024

const paymentRequired = (c: Context<AppEnv>, error: string, accepts: unknown) => {
  const pr = { x402Version: 2, error, resource: { url: c.req.url }, accepts: [accepts] }
  return c.json(pr, 402, { 'PAYMENT-REQUIRED': b64json(pr) })
}

// upstream headers minus encoding/length (fetch already decoded body)
const relay = (res: Response, extra: Record<string, string> = {}, body: BodyInit | null = res.body) => {
  const headers = new Headers(res.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  return new Response(body, { status: res.status, headers })
}

async function upstream(c: Context<AppEnv>, ep: Endpoint, body: ArrayBuffer | undefined) {
  const url = new URL(c.req.url)
  const headers = new Headers()
  c.req.raw.headers.forEach((v, k) => DROP_REQ.test(k) || headers.set(k, v))
  // seller keys win over caller's
  if (ep.upstreamHeaders) for (const [k, v] of Object.entries(JSON.parse(await unseal(c.env.BETTER_AUTH_SECRET, ep.upstreamHeaders)) as Record<string, string>)) headers.set(k, v)
  const rest = url.pathname.slice(url.pathname.indexOf(ep.id) + ep.id.length)
  const target = new URL(ep.upstreamUrl + rest + url.search)
  const init = { method: c.req.method, headers, body, signal: AbortSignal.timeout(30_000) }
  // own demo upstream: in-process, a worker can't fetch its own hostname
  if (target.origin === url.origin && target.pathname.startsWith('/demo/')) return demo.fetch(new Request(target.href.replace(`${target.origin}/demo`, target.origin), init))
  return fetch(target, init)
}

const requirementsOf = (ep: Endpoint, origin: string) => {
  const metered = ep.pricing === 'token' || ep.pricing === 'char'
  return {
    scheme: SCHEME,
    network: NETWORK,
    amount: String(metered ? ep.maxAmount! : ep.price), // metered: agent signs the cap, unused part refunded
    asset: 'USD',
    payTo: ep.sellerId,
    maxTimeoutSeconds: 60,
    extra: {
      facilitator: origin,
      ...(metered && { pricing: { unit: ep.pricing, rate: String(ep.price), max: String(ep.maxAmount) } }),
      ...(ep.pricing === 'pass' && { pass: { seconds: ep.passSeconds } }),
    },
  } as const
}

// x402 order: verify → upstream → settle (metered: settle cap, refund unused after counting)
export const forward = factory.createHandlers(async (c) => {
  const db = c.var.db
  const id = c.req.param('endpointId')!
  const [ep] = await db.select().from(endpoints).where(eq(endpoints.id, id))
  if (!ep) return c.json({ error: 'unknown endpoint' }, 404)
  const origin = new URL(c.req.url).origin
  const requirements = requirementsOf(ep, origin)
  const method = c.req.method
  const reqBody = method === 'GET' || method === 'HEAD' ? undefined : await c.req.arrayBuffer()

  // pass holder: signed identity, no payment
  if (ep.pricing === 'pass') {
    const payer = await verifyAgentHeader(c.req.header('paycall-agent'), method, c.req.url)
    if (payer) {
      const [p] = await db
        .select({ expiresAt: passes.expiresAt })
        .from(passes)
        .innerJoin(agents, eq(agents.pubkey, passes.agentPubkey))
        .where(and(eq(passes.agentPubkey, payer), eq(passes.endpointId, ep.id), gt(passes.expiresAt, sql`now()`), eq(agents.paused, false)))
      if (p) {
        const res = await upstream(c, ep, reqBody).catch(() => null)
        if (!res) return c.json({ error: 'upstream_unreachable' }, 502)
        return relay(res, { 'PAYMENT-RESPONSE': b64json({ success: true, payer, pass: { expiresAt: p.expiresAt } }) })
      }
    }
  }

  const sig = c.req.header('payment-signature')
  if (!sig) return paymentRequired(c, 'payment_required', requirements)
  let decoded: unknown
  try {
    decoded = JSON.parse(atob(sig))
  } catch {
    return paymentRequired(c, 'invalid_payment_header', requirements)
  }
  const parsed = PaymentBody.shape.paymentPayload.safeParse(decoded)
  if (!parsed.success) return paymentRequired(c, 'invalid_payload', requirements)
  const body: PaymentBody = { x402Version: 2, paymentPayload: parsed.data, paymentRequirements: requirements }

  const idemKey = `idem:${await sha256(sig)}`
  const check = await checkPayment(db, ep.sellerId, body, c.req.url)
  if (!check.ok) {
    // same paid request retried (response lost) → replay stored response, never re-run upstream
    if (check.reason === 'stale_voucher') {
      const hit = await c.env.KV.get<{ status: number; headers: [string, string][]; body: string }>(idemKey, 'json')
      if (hit) return new Response(Uint8Array.from(atob(hit.body), (ch) => ch.charCodeAt(0)), { status: hit.status, headers: [...hit.headers, ['paycall-replay', '1']] })
    }
    return paymentRequired(c, check.reason, requirements)
  }

  let res: Response
  try {
    res = await upstream(c, ep, reqBody)
  } catch {
    return c.json({ error: 'upstream_unreachable' }, 502)
  }
  if (!res.ok) return relay(res) // upstream fail → no charge

  const signed = Number(requirements.amount)
  const r = await settlePayment(db, ep.sellerId, body, { resource: c.req.url })
  if (!r.ok) {
    await res.body?.cancel() // not paid → withhold body
    return paymentRequired(c, r.reason, requirements)
  }
  reloadAfterSettle(c, r)

  let passUntil: Date | undefined
  if (ep.pricing === 'pass') {
    const [p] = await db
      .insert(passes)
      .values({ agentPubkey: r.payer, endpointId: ep.id, expiresAt: sql`now() + make_interval(secs => ${ep.passSeconds})` })
      .onConflictDoUpdate({ target: [passes.agentPubkey, passes.endpointId], set: { expiresAt: sql`greatest(${passes.expiresAt}, now()) + make_interval(secs => ${ep.passSeconds})` } })
      .returning({ expiresAt: passes.expiresAt })
    passUntil = p!.expiresAt
  }

  const receipt = (amount: number, units?: number) =>
    signReceipt(c.env.BETTER_AUTH_SECRET, {
      iss: origin, sub: String(r.entryId), payer: r.payer, payTo: ep.sellerId, resource: c.req.url, amount: String(amount), units, pass: passUntil?.toISOString(), iat: Math.floor(Date.now() / 1000),
    } satisfies Receipt)
  const paid = (amount: number, extra: object = {}) => ({ success: true, payer: r.payer, transaction: String(r.entryId), network: NETWORK, amount: String(amount), ...extra })
  // settle + refund are idempotent per voucher, so a duplicate settle must not refund twice
  const refundUnused = (dbx: typeof db, charged: number) =>
    signed > charged && !r.duplicate ? refund(dbx, r.entryId, ep.sellerId, signed - charged, 'unused') : undefined

  const metered = ep.pricing === 'token' || ep.pricing === 'char'
  const stream = res.headers.get('content-type')?.startsWith('text/event-stream')

  if (metered && stream) {
    // stream now, count as it flows; refund + receipt when it ends (own conn lifetime: index.ts skips close for sse)
    const rate = ep.price
    const meter = meterStream(ep.pricing as Unit, rate, signed, async (units, cut) => {
      const charged = cost(units, rate, signed)
      try {
        await refundUnused(db, charged)
        const jws = await receipt(charged, units)
        return `event: paycall-receipt\ndata: ${JSON.stringify(paid(charged, { units, cut, refunded: String(signed - charged), receipt: jws }))}\n\n`
      } finally {
        c.executionCtx.waitUntil(c.var.closeDb())
      }
    })
    return relay(res, { 'PAYMENT-RESPONSE': b64json(paid(signed, { metered: true, max: String(signed) })) }, res.body!.pipeThrough(meter))
  }

  const passInfo = passUntil && { pass: { expiresAt: passUntil } }
  // fixed price + streamed/unknown-size body: pass through untouched, no replay cache
  const len = Number(res.headers.get('content-length') ?? NaN)
  if (!metered && (stream || !(len <= IDEM_MAX)))
    return relay(res, { 'PAYMENT-RESPONSE': b64json(paid(signed, { ...passInfo, receipt: await receipt(signed) })) })

  const buf = new Uint8Array(await res.arrayBuffer())
  let charged = signed
  let units: number | undefined
  if (metered) {
    units = countBody(new TextDecoder().decode(buf), ep.pricing as Unit)
    charged = cost(units, ep.price, signed)
    await refundUnused(db, charged)
  }
  const header = b64json(paid(charged, { ...(metered && { units, refunded: String(signed - charged) }), ...passInfo, receipt: await receipt(charged, units) }))
  const out = relay(res, { 'PAYMENT-RESPONSE': header }, buf)
  if (buf.byteLength <= IDEM_MAX) {
    let bin = ''
    for (const b of buf) bin += String.fromCharCode(b)
    c.executionCtx.waitUntil(c.env.KV.put(idemKey, JSON.stringify({ status: out.status, headers: [...out.headers], body: btoa(bin) }), { expirationTtl: IDEM_TTL }))
  }
  return out
})

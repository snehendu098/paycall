import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { endpoints } from '../db/schema'
import { factory } from '../lib/factory'
import { checkPayment, NETWORK, PaymentBody, SCHEME, settlePayment } from '../payments'
import { reloadAfterSettle } from '../topups'
import type { AppEnv } from '../types'

const b64json = (o: unknown) => btoa(JSON.stringify(o))
const DROP_REQ = /^(host|authorization|cookie|payment-.*|cf-.*|x-forwarded-.*)$/i

const paymentRequired = (c: Context<AppEnv>, error: string, accepts: unknown) => {
  const pr = { x402Version: 2, error, resource: { url: c.req.url }, accepts: [accepts] }
  return c.json(pr, 402, { 'PAYMENT-REQUIRED': b64json(pr) })
}

// upstream headers minus encoding/length (fetch already decoded body)
const relay = (res: Response, extra: Record<string, string> = {}) => {
  const headers = new Headers(res.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  for (const [k, v] of Object.entries(extra)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

// x402 order: verify → upstream → settle
export const forward = factory.createHandlers(async (c) => {
  const id = c.req.param('endpointId')!
  const [ep] = await c.var.db.select().from(endpoints).where(eq(endpoints.id, id))
  if (!ep) return c.json({ error: 'unknown endpoint' }, 404)

  const url = new URL(c.req.url)
  const requirements = {
    scheme: SCHEME,
    network: NETWORK,
    amount: String(ep.price),
    asset: 'USD',
    payTo: ep.sellerId,
    maxTimeoutSeconds: 60,
    extra: { facilitator: url.origin },
  } as const

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

  const check = await checkPayment(c.var.db, ep.sellerId, body, c.req.url)
  if (!check.ok) return paymentRequired(c, check.reason, requirements)

  const headers = new Headers()
  c.req.raw.headers.forEach((v, k) => DROP_REQ.test(k) || headers.set(k, v))
  const rest = url.pathname.slice(url.pathname.indexOf(id) + id.length)
  const method = c.req.method
  let res: Response
  try {
    res = await fetch(ep.upstreamUrl + rest + url.search, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : await c.req.arrayBuffer(),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return c.json({ error: 'upstream_unreachable' }, 502)
  }
  // upstream fail → no charge
  if (!res.ok) return relay(res)

  const r = await settlePayment(c.var.db, ep.sellerId, body)
  if (!r.ok) {
    // not paid → withhold body
    await res.body?.cancel()
    return paymentRequired(c, r.reason, requirements)
  }
  reloadAfterSettle(c, r)
  return relay(res, { 'PAYMENT-RESPONSE': b64json({ success: true, payer: r.payer, transaction: String(r.entryId), network: NETWORK }) })
})

// self-host paid api via paycall x402 'paycall-prepaid'. mirrors paycall-server proxy.controller:
// no sig → 402. verify → run handler → settle only if ok. handler fail = no charge. settle fail = 402, body withheld.
// type-only imports: hono/express optional peers, never loaded at runtime
import type { MiddlewareHandler } from 'hono'
import type { RequestHandler } from 'express'

// price: fixed "0.01" or per request, e.g. (req) => req.url.includes('/hd') ? '0.05' : '0.01'
// metered: price = signed cap; handler sets `x-paycall-charge: <usd>` = actual use,
// rest refunded after settle
export type PaycallOptions = { apiKey: string; price: string | ((req: Request) => string | Promise<string>); metered?: boolean; facilitator?: string }
type Settle = (res: Response) => Promise<{ ok: true; header: string } | { ok: false; res: Response }>
export const CHARGE_HEADER = 'x-paycall-charge'
const micros = (usd: string) => {
  const m = Math.round(Number(usd) * 1e6)
  if (!(m > 0)) throw new Error(`paycall: bad price ${usd}`)
  return m
}

const b64json = (o: unknown) => btoa(JSON.stringify(o))

export function paycall({ apiKey, price, metered = false, facilitator = 'https://api.paycall.live' }: PaycallOptions) {
  if (typeof price === 'string') micros(price) // fail fast on bad fixed price
  facilitator = facilitator.replace(/\/$/, '')

  const call = (path: string, body?: string) =>
    fetch(facilitator + path, { method: body ? 'POST' : 'GET', body, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' } })
  const json = async (res: Response): Promise<any> => {
    if (!res.ok) throw new Error(`paycall: ${res.url} ${res.status} ${await res.text()}`)
    return res.json()
  }
  // lazy once, retry on failure
  let sellerId: Promise<string> | undefined
  const getSellerId = () =>
    (sellerId ??= call('/sellers/me').then(json).then(
      (r) => r.seller.id,
      (e) => ((sellerId = undefined), Promise.reject(e)),
    ))

  // gate: 402 Response to return as-is, or settle() to call after handler succeeds
  return async (req: Request): Promise<Response | Settle> => {
    const url = req.url
    const sig = req.headers.get('payment-signature')
    const amount = micros(typeof price === 'string' ? price : await price(req))
    const requirements = {
      scheme: 'paycall-prepaid',
      network: 'paypal:sandbox',
      amount: String(amount),
      asset: 'USD',
      payTo: await getSellerId(),
      maxTimeoutSeconds: 60,
      extra: { facilitator, ...(metered && { pricing: { unit: 'usage', max: String(amount) } }) },
    }
    const required = (error: string) => {
      const pr = { x402Version: 2, error, resource: { url }, accepts: [requirements] }
      return Response.json(pr, { status: 402, headers: { 'PAYMENT-REQUIRED': b64json(pr) } })
    }
    if (!sig) return required('payment_required')
    let paymentPayload: unknown
    try {
      paymentPayload = JSON.parse(atob(sig))
    } catch {
      return required('invalid_payment_header')
    }
    const body = JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: requirements })
    // facilitator zod-validates payload shape; 400 there = malformed payload
    const v = await call('/verify', body)
    if (v.status === 400) return required('invalid_payload')
    const check: { isValid: boolean; invalidReason?: string } = await json(v)
    if (!check.isValid) return required(check.invalidReason ?? 'invalid_payment')

    return async (res: Response) => {
      const r = await json(await call('/settle', body))
      if (!r.success) return { ok: false, res: required(r.errorReason ?? 'settle_failed') }
      let charged = amount
      const used = res.headers.get(CHARGE_HEADER)
      if (metered && used !== null) {
        charged = Math.min(amount, Math.max(0, Math.round(Number(used) * 1e6) || 0))
        // ponytail: refund fail → buyer charged cap; seller refunds from Earn later
        if (charged < amount) await call(`/entries/${r.transaction}/refund`, JSON.stringify({ amount: amount - charged })).catch(() => {})
      }
      return { ok: true, header: b64json({ success: true, payer: r.payer, transaction: r.transaction, network: r.network, amount: String(charged) }) }
    }
  }
}

// web standard: Next route handlers, Bun.serve, Workers, Deno
export function withPaycall(handler: (req: Request) => Response | Promise<Response>, opts: PaycallOptions) {
  const gate = paycall(opts)
  return async (req: Request): Promise<Response> => {
    const g = await gate(req)
    if (g instanceof Response) return g
    const res = await handler(req)
    if (!res.ok) return res
    const s = await g(res)
    if (!s.ok) {
      await res.body?.cancel()
      return s.res
    }
    const out = new Response(res.body, res) // handler headers may be immutable
    out.headers.set('PAYMENT-RESPONSE', s.header)
    out.headers.delete(CHARGE_HEADER)
    return out
  }
}

export function paycallHono(opts: PaycallOptions): MiddlewareHandler {
  const gate = paycall(opts)
  return async (c, next) => {
    const g = await gate(c.req.raw)
    if (g instanceof Response) return g
    await next()
    if (!c.res.ok) return
    const s = await g(c.res)
    if (!s.ok) {
      await c.res.body?.cancel()
      c.res = s.res
    } else {
      c.header('PAYMENT-RESPONSE', s.header)
      c.res.headers.delete(CHARGE_HEADER)
    }
  }
}

// settle hooked into res.end: res.send/json headers not flushed yet → can still swap in 402
// ponytail: streamed (res.write before end) already sent headers+body → settle fail only logged,
// seller unpaid, buyer not charged. buffer response if that matters
export function paycallExpress(opts: PaycallOptions): RequestHandler {
  const gate = paycall(opts)
  return async (req, res, next) => {
    try {
      // body not needed for pricing/verify; headers are
      const g = await gate(new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, { method: req.method, headers: req.headers as Record<string, string> }))
      if (g instanceof Response) {
        res.status(g.status).set(Object.fromEntries(g.headers)).send(await g.text())
        return
      }
      const end = res.end.bind(res) as (...a: unknown[]) => typeof res
      res.end = ((...args: unknown[]) => {
        if (res.statusCode >= 400) return end(...args)
        const charge = res.getHeader(CHARGE_HEADER)
        res.removeHeader(CHARGE_HEADER)
        g(new Response(null, { headers: charge === undefined ? {} : { [CHARGE_HEADER]: String(charge) } }))
          .then(async (s) => {
            if (res.headersSent) {
              if (!s.ok) console.error('paycall: settle failed after headers sent', s.res.headers.get('payment-required'))
              return end(...args)
            }
            if (s.ok) {
              res.setHeader('PAYMENT-RESPONSE', s.header)
              return end(...args)
            }
            res.removeHeader('content-length') // handler's body length, not ours
            for (const [k, v] of s.res.headers) res.setHeader(k, v)
            res.statusCode = 402
            end(await s.res.text())
          })
          .catch((e) => {
            console.error('paycall: settle error', e)
            if (res.headersSent) return end()
            res.removeHeader('content-length')
            res.statusCode = 502
            end()
          })
        return res
      }) as typeof res.end
      next()
    } catch (e) {
      next(e)
    }
  }
}

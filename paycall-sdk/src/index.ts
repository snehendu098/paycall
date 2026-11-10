// paycall-prepaid x402 client. wire format must match paycall-server lib/voucher.ts
const SCHEME = 'paycall-prepaid'
const SIGNED_FIELDS = ['channelId', 'payer', 'payTo', 'cumulativeAmount', 'currency', 'seq', 'expiry']
const RETRYABLE = ['stale_voucher', 'channel_mismatch'] // our channel view wrong → refetch

type Requirements = {
  scheme: string
  network: string
  amount: string // metered: the cap; unused part comes back as a refund
  asset: string
  payTo: string
  extra?: { facilitator?: string; pass?: { seconds: number }; pricing?: { unit: string; rate: string; max: string } }
}
type Channel = { id: string; seq: number; cumulative: number }

// no Buffer → runs in workers, browsers, bun, node
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export function decodePaymentHeader<T = any>(h: string | null | undefined): T | undefined {
  if (!h) return
  try {
    return JSON.parse(atob(h))
  } catch {}
}

// signed receipt (compact JWS, EdDSA) from PAYMENT-RESPONSE.receipt → payload if valid for that facilitator's jwks
export async function verifyReceipt(jws: string, opts: { jwksUrl?: string; fetch?: typeof fetch } = {}) {
  const [h, p, sig] = jws.split('.')
  if (!h || !p || !sig) return
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(p)))
  const { kid } = JSON.parse(new TextDecoder().decode(fromB64url(h)))
  const res = await (opts.fetch ?? fetch)(opts.jwksUrl ?? `${payload.iss}/.well-known/jwks.json`)
  const jwk = ((await res.json()) as { keys: ({ kid?: string } & Record<string, unknown>)[] }).keys.find((k) => k.kid === kid)
  if (!jwk) return
  const key = await crypto.subtle.importKey('jwk', jwk as never, 'Ed25519', false, ['verify'])
  return (await crypto.subtle.verify('Ed25519', key, fromB64url(sig), new TextEncoder().encode(`${h}.${p}`))) ? payload : undefined
}

export async function generateKey() {
  const k = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    privateKey: b64url((await crypto.subtle.exportKey('pkcs8', k.privateKey)) as ArrayBuffer),
    pubkey: b64url((await crypto.subtle.exportKey('raw', k.publicKey)) as ArrayBuffer),
  }
}

// opts.fetch: custom transport (e.g. worker dispatching own-origin urls in-process)
export async function createAgent(privateKey: string, opts: { fetch?: typeof fetch } = {}) {
  const f = opts.fetch ?? fetch
  const key = await crypto.subtle.importKey('pkcs8', fromB64url(privateKey), 'Ed25519', true, ['sign'])
  const pubkey = ((await crypto.subtle.exportKey('jwk', key)) as { x?: string }).x
  if (!pubkey) throw new Error('paycall: not an Ed25519 pkcs8 key')
  const channels = new Map<string, Channel>()
  const queues = new Map<string, Promise<unknown>>()
  const passOrigins = new Set<string>() // servers that sell time passes → send identity so held passes ride free
  let spent = 0

  // PAYCALL-AGENT: proves this agent holds a pass, no payment
  async function identity(method: string, url: string) {
    const ts = Math.floor(Date.now() / 1000)
    const sig = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(`paycall-agent:${ts}:${method.toUpperCase()}:${url}`))
    return `${pubkey}.${ts}.${b64url(sig)}`
  }

  async function loadChannel(facilitator: string, payTo: string): Promise<Channel> {
    const res = await f(`${facilitator}/channels/${pubkey}/${encodeURIComponent(payTo)}`)
    if (res.status === 404) return { id: crypto.randomUUID(), seq: 0, cumulative: 0 }
    if (!res.ok) throw new Error(`paycall: channel lookup ${res.status}`)
    const ch = (await res.json()) as { channelId: string; seq: number; cumulative: number | string }
    return { id: ch.channelId, seq: ch.seq, cumulative: Number(ch.cumulative) }
  }

  async function sign(ch: Channel, req: Requirements) {
    const v = {
      channelId: ch.id,
      payer: pubkey,
      payTo: req.payTo,
      cumulativeAmount: String(ch.cumulative + Number(req.amount)),
      currency: 'USD',
      seq: ch.seq + 1,
      expiry: Math.floor(Date.now() / 1000) + 300,
    }
    const sig = b64url(await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(JSON.stringify(v, SIGNED_FIELDS))))
    return btoa(JSON.stringify({ x402Version: 2, accepted: req, payload: { ...v, sig } }))
  }

  async function pay(send: (h?: Headers) => Promise<Response>, headers: Headers, req: Requirements, facilitator: string, ck: string) {
    const amount = Number(req.amount)
    for (let retried = false; ; retried = true) {
      const ch = channels.get(ck) ?? (await loadChannel(facilitator, req.payTo))
      const h = new Headers(headers)
      h.set('payment-signature', await sign(ch, req))
      const res = await send(h)
      if (res.ok) {
        channels.set(ck, { id: ch.id, seq: ch.seq + 1, cumulative: ch.cumulative + amount })
        // fixed price: amount. metered: header says what was kept (stream: final amount in trailing sse event)
        const paid = decodePaymentHeader(res.headers.get('payment-response'))
        spent += paid?.metered ? amount : Number(paid?.amount ?? amount)
        return res
      }
      const reason = decodePaymentHeader(res.headers.get('payment-required'))?.error
      if (res.status !== 402 || retried || !RETRYABLE.includes(reason)) return res
      channels.delete(ck)
    }
  }

  async function paidFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const r = input instanceof Request ? new Request(input, init) : new Request(String(input), init)
    const body = r.body ? await r.arrayBuffer() : undefined // buffer once → retries resend
    const send = (h = r.headers) => f(r.url, { method: r.method, headers: h, body, signal: r.signal, redirect: r.redirect })
    const origin = new URL(r.url).origin
    const withId = async () => {
      const h = new Headers(r.headers)
      h.set('paycall-agent', await identity(r.method, r.url))
      return h
    }
    let headers = passOrigins.has(origin) ? await withId() : r.headers
    let res = await send(headers)
    if (res.status !== 402) return res
    let req = decodePaymentHeader<{ accepts?: Requirements[] }>(res.headers.get('payment-required'))?.accepts?.find((a) => a.scheme === SCHEME)
    if (!req) return res
    await res.body?.cancel()
    if (req.extra?.pass && !passOrigins.has(origin)) {
      // maybe we already hold a pass: retry with identity before paying
      passOrigins.add(origin)
      headers = await withId()
      res = await send(headers)
      if (res.status !== 402) return res
      req = decodePaymentHeader<{ accepts?: Requirements[] }>(res.headers.get('payment-required'))?.accepts?.find((a) => a.scheme === SCHEME) ?? req
      await res.body?.cancel()
    }
    const facilitator = req.extra?.facilitator ?? origin
    const ck = `${facilitator}|${req.payTo}`
    // seq strict → serialize per seller
    const run = (queues.get(ck) ?? Promise.resolve()).then(() => pay(send, headers, req!, facilitator, ck))
    queues.set(ck, run.catch(() => {}))
    return run
  }

  return {
    pubkey,
    fetch: paidFetch,
    get spent() {
      return spent // micros, this session
    },
  }
}

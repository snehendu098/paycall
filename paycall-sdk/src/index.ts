// paycall-prepaid x402 client. wire format must match paycall-server lib/voucher.ts
const SCHEME = 'paycall-prepaid'
const SIGNED_FIELDS = ['channelId', 'payer', 'payTo', 'cumulativeAmount', 'currency', 'seq', 'expiry']
const RETRYABLE = ['stale_voucher', 'channel_mismatch'] // our channel view wrong → refetch

type Requirements = { scheme: string; network: string; amount: string; asset: string; payTo: string; extra?: { facilitator?: string } }
type Channel = { id: string; seq: number; cumulative: number }

const b64url = (b: ArrayBuffer) => Buffer.from(b).toString('base64url')

export function decodePaymentHeader<T = any>(h: string | null | undefined): T | undefined {
  if (!h) return
  try {
    return JSON.parse(Buffer.from(h, 'base64').toString())
  } catch {}
}

export async function generateKey() {
  const k = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    privateKey: b64url(await crypto.subtle.exportKey('pkcs8', k.privateKey)),
    pubkey: b64url(await crypto.subtle.exportKey('raw', k.publicKey)),
  }
}

export async function createAgent(privateKey: string) {
  const key = await crypto.subtle.importKey('pkcs8', Buffer.from(privateKey, 'base64url'), 'Ed25519', true, ['sign'])
  const pubkey = (await crypto.subtle.exportKey('jwk', key)).x
  if (!pubkey) throw new Error('paycall: not an Ed25519 pkcs8 key')
  const channels = new Map<string, Channel>()
  const queues = new Map<string, Promise<unknown>>()
  let spent = 0

  async function loadChannel(facilitator: string, payTo: string): Promise<Channel> {
    const res = await fetch(`${facilitator}/channels/${pubkey}/${encodeURIComponent(payTo)}`)
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
        spent += amount
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
    const send = (h = r.headers) => fetch(r.url, { method: r.method, headers: h, body, signal: r.signal, redirect: r.redirect })
    const res = await send()
    if (res.status !== 402) return res
    const req = decodePaymentHeader<{ accepts?: Requirements[] }>(res.headers.get('payment-required'))?.accepts?.find((a) => a.scheme === SCHEME)
    if (!req) return res
    await res.body?.cancel()
    const facilitator = req.extra?.facilitator ?? new URL(r.url).origin
    const ck = `${facilitator}|${req.payTo}`
    // seq strict → serialize per seller
    const run = (queues.get(ck) ?? Promise.resolve()).then(() => pay(send, r.headers, req, facilitator, ck))
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

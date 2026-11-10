import { expect, test } from 'bun:test'
import { createAgent, decodePaymentHeader, generateKey } from '../src/index'

const API = process.env.PAYCALL_API ?? 'https://api.paycall.live'
const SIGNED_FIELDS = ['channelId', 'payer', 'payTo', 'cumulativeAmount', 'currency', 'seq', 'expiry']

async function api(method: string, path: string, body: unknown, key?: string) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(key && { authorization: `Bearer ${key}` }) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`)
  return res.json() as Promise<any>
}

// live fixtures: unfunded owner + seller + endpoint
const k = await generateKey()
const agent = await createAgent(k.privateKey)
const owner = await api('POST', '/owners', { email: `sdk-${Date.now()}@example.com` })
const seller = await api('POST', '/sellers', { name: 'sdk test', paypalEmail: `sdk-seller-${Date.now()}@example.com` })
const ep = await api('POST', '/endpoints', { name: 'meteo', upstreamUrl: 'https://api.open-meteo.com/v1/forecast', price: 10000 }, seller.apiKey)
await api('POST', '/agents', { pubkey: k.pubkey, name: 'sdk bot' }, owner.apiKey)
const url = `${API}/p/${ep.id}?latitude=52.52&longitude=13.41&current=temperature_2m`

test('generateKey/createAgent pubkeys match', () => {
  expect(k.pubkey).toHaveLength(43)
  expect(agent.pubkey).toBe(k.pubkey)
})

test('unpaid fetch → 402 with decodable header', async () => {
  const res = await fetch(url)
  expect(res.status).toBe(402)
  const pr = decodePaymentHeader(res.headers.get('payment-required'))
  expect(pr.accepts[0]).toMatchObject({ scheme: 'paycall-prepaid', amount: '10000', payTo: seller.id, extra: { facilitator: API } })
})

test('unfunded paid fetch → 402 insufficient_funds, sent voucher verifies', async () => {
  const real = globalThis.fetch
  const sigs: string[] = []
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const s = new Headers(init?.headers).get('payment-signature')
    if (s) sigs.push(s)
    return real(input, init)
  }) as typeof fetch
  try {
    const res = await agent.fetch(url)
    expect(res.status).toBe(402)
    expect(decodePaymentHeader(res.headers.get('payment-required')).error).toBe('insufficient_funds')
  } finally {
    globalThis.fetch = real
  }
  expect(agent.spent).toBe(0)
  expect(sigs).toHaveLength(1)
  const { payload: v } = decodePaymentHeader(sigs[0])
  expect(v).toMatchObject({ payer: k.pubkey, payTo: seller.id, seq: 1, cumulativeAmount: '10000', currency: 'USD' })
  const pub = await crypto.subtle.importKey('raw', Buffer.from(k.pubkey, 'base64url'), 'Ed25519', false, ['verify'])
  const bytes = new TextEncoder().encode(JSON.stringify(v, SIGNED_FIELDS))
  expect(await crypto.subtle.verify('Ed25519', pub, Buffer.from(v.sig, 'base64url'), bytes)).toBe(true)
})

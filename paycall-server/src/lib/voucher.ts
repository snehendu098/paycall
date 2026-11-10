import { z } from 'zod'
import { b64url, fromB64url } from './util'

export const Micros = z.string().regex(/^\d{1,15}$/)

export const Voucher = z.object({
  channelId: z.uuid(),
  payer: z.string().regex(/^[A-Za-z0-9_-]{43}$/), // raw ed25519 pubkey, b64url
  payTo: z.string().min(1).max(64),
  cumulativeAmount: Micros,
  currency: z.literal('USD'),
  seq: z.number().int().positive(),
  expiry: z.number().int().positive(), // unix seconds
  sig: z.string().max(128),
})
export type Voucher = z.infer<typeof Voucher>

// fixed key order → same bytes everywhere
const SIGNED_FIELDS = ['channelId', 'payer', 'payTo', 'cumulativeAmount', 'currency', 'seq', 'expiry']
const signedBytes = (v: Omit<Voucher, 'sig'>) => new TextEncoder().encode(JSON.stringify(v, SIGNED_FIELDS))

export async function signVoucher(v: Omit<Voucher, 'sig'>, privateKey: CryptoKey): Promise<Voucher> {
  const sig = await crypto.subtle.sign('Ed25519', privateKey, signedBytes(v))
  return { ...v, sig: b64url(new Uint8Array(sig)) }
}

export async function verifyVoucher(v: Voucher) {
  try {
    const key = await crypto.subtle.importKey('raw', fromB64url(v.payer), 'Ed25519', false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, fromB64url(v.sig), signedBytes(v))
  } catch {
    return false
  }
}

// pass access without paying: PAYCALL-AGENT: <pubkey>.<unix ts>.<sig over "paycall-agent:<ts>:<METHOD>:<url>">
// ponytail: replayable within the 5 min window by whoever sees the header; nonce store if passes get valuable
export async function verifyAgentHeader(h: string | undefined, method: string, url: string) {
  const [payer, ts, sig] = h?.split('.') ?? []
  if (!payer || !sig || !/^\d+$/.test(ts ?? '') || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return
  try {
    const key = await crypto.subtle.importKey('raw', fromB64url(payer), 'Ed25519', false, ['verify'])
    const ok = await crypto.subtle.verify('Ed25519', key, fromB64url(sig), new TextEncoder().encode(`paycall-agent:${ts}:${method.toUpperCase()}:${url}`))
    return ok ? payer : undefined
  } catch {}
}

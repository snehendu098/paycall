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

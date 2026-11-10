// signed receipts: compact JWS (EdDSA) per charge, verifiable offline against /.well-known/jwks.json
// ponytail: key derived from BETTER_AUTH_SECRET (sha256 seed); rotating it changes kid, old receipts need old jwk
import { b64url } from './util'

const enc = new TextEncoder()
const PKCS8_ED25519 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])
const cache = new Map<string, Promise<{ key: CryptoKey; jwk: { kty: 'OKP'; crv: 'Ed25519'; x: string; kid: string; alg: 'EdDSA'; use: 'sig' } }>>()

const signer = (secret: string) => {
  let k = cache.get(secret)
  if (!k) {
    k = (async () => {
      const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`receipt:${secret}`)))
      const key = await crypto.subtle.importKey('pkcs8', new Uint8Array([...PKCS8_ED25519, ...seed]), 'Ed25519', true, ['sign'])
      const { x } = (await crypto.subtle.exportKey('jwk', key)) as { x: string }
      return { key, jwk: { kty: 'OKP', crv: 'Ed25519', x, kid: x.slice(0, 16), alg: 'EdDSA', use: 'sig' } as const }
    })()
    cache.set(secret, k)
  }
  return k
}

export type Receipt = {
  iss: string // facilitator origin
  sub: string // charge entry id
  payer: string // agent pubkey
  payTo: string // seller id
  resource: string
  amount: string // micros actually charged (after unused refund)
  units?: number // metered
  pass?: string // pass expiry iso
  iat: number
}

export async function signReceipt(secret: string, r: Receipt) {
  const { key, jwk } = await signer(secret)
  const head = b64url(enc.encode(JSON.stringify({ alg: 'EdDSA', typ: 'paycall-receipt+jwt', kid: jwk.kid })))
  const body = b64url(enc.encode(JSON.stringify(r)))
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, enc.encode(`${head}.${body}`)))
  return `${head}.${body}.${b64url(sig)}`
}

export const jwks = async (secret: string) => ({ keys: [(await signer(secret)).jwk] })

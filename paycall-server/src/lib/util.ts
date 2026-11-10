import { z } from 'zod'
export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export const randomId = (prefix: string, bytes = 12) =>
  `${prefix}_${b64url(crypto.getRandomValues(new Uint8Array(bytes)))}`

export const sha256 = async (s: string) =>
  b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))

// 1_000_000 micros = $1
export const toDollars = (micros: number) => (micros / 1e6).toFixed(2)
export const toMicros = (dollars: string) => Math.round(Number(dollars) * 1e6)
export const floorCents = (micros: number) => Math.floor(micros / 10_000) * 10_000

export const zMicros = z.number().int().nonnegative().max(1e12)

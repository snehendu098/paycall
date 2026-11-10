export const API = (process.env.NEXT_PUBLIC_API_URL ?? 'https://paycall-server.silonelabs.workers.dev').replace(/\/$/, '')

const K = 'paycall_key'
export const getKey = () => localStorage.getItem(K)
export const setKey = (k: string) => localStorage.setItem(K, k)
export const clearKey = () => localStorage.removeItem(K)
export const roleOf = (k: string | null) =>
  k?.startsWith('pc_owner_') ? 'buyer' : k?.startsWith('pc_seller_') ? 'seller' : null

export async function api<T>(path: string, init: { method?: string; body?: unknown; key?: string | null } = {}): Promise<T> {
  const key = init.key === undefined ? getKey() : init.key
  const res = await fetch(API + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    const msg = typeof e === 'string' ? e : e?.issues?.map((i: { message: string }) => i.message).join(', ') ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

// micros → "$1.23"; sub-cent amounts keep precision
export const $ = (m: number) => {
  const s = Math.abs(m) / 1e6
  const str = m % 10_000 === 0 ? s.toFixed(2) : s.toFixed(6).replace(/0+$/, '')
  return (m < 0 ? '-$' : '$') + str
}
export const toMicros = (dollars: string) => Math.round(parseFloat(dollars) * 1e6)
export const toDollars = (m: number) => String(m / 1e6)

export const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const short = (s: string | null | undefined) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : '—')

export function ago(t: string | number) {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export type Entry = {
  id: number | string
  type: 'topup' | 'reload' | 'charge' | 'payout' | 'fee'
  amount: number
  ownerId: string | null
  sellerId: string | null
  agentPubkey: string | null
  ref: string | null
  createdAt: string
}

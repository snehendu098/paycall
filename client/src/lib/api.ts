export const API = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api.paycall.live').replace(/\/$/, '')

// micros → "$1.23"; sub-cent amounts keep precision
export const $ = (m: number) => {
  const s = Math.abs(m) / 1e6
  const str = m % 10_000 === 0 ? s.toFixed(2) : s.toFixed(6).replace(/0+$/, '')
  return (m < 0 ? '-$' : '$') + str
}
export const toMicros = (dollars: string) => Math.round(parseFloat(dollars) * 1e6)
export const toDollars = (m: number) => String(m / 1e6)

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
  type: 'topup' | 'reload' | 'charge' | 'refund' | 'payout' | 'fee'
  amount: number
  ownerId: string | null
  sellerId: string | null
  agentPubkey: string | null
  ref: string | null
  parentId?: number | null // refund → its charge
  resource?: string | null
  units?: number | null // metered charge
  unit?: 'token' | 'char' | null
  endpoint?: string | null // listing name, from resource
  seller?: string | null
  refunded?: number // charge: refunded so far (absent on live sse rows)
  dispute?: 'open' | 'escalated' | 'refunded' | 'rejected' | null
  createdAt: string
}

export type Dispute = { id: number; entryId: number; ownerId: string; sellerId: string; amount: number; reason: string; status: 'open' | 'escalated' | 'refunded' | 'rejected'; createdAt: string; resolvedAt: string | null; reply: string | null; adminNote: string | null; decidedBy: 'seller' | 'admin' | 'buyer' | 'timeout' | null; escalatedAt: string | null; resource: string | null; chargedAt: string }

export type Pricing = { pricing: 'call' | 'token' | 'char' | 'pass'; price: number; maxAmount: number | null; passSeconds: number | null }
// 3600 → 1h, 604800 → 7d (86400 stays 24h)
export const dur = (s: number) => (s % 86_400 === 0 && s > 86_400 ? `${s / 86_400}d` : s % 3600 === 0 ? `${s / 3600}h` : `${Math.round(s / 60)}m`)
/** Suffix after `$(price)`: "/call", "/token · max $0.05", " / 1h pass". */
export const per = (p: Pricing) =>
  p.pricing === 'pass' ? ` / ${dur(p.passSeconds ?? 0)} pass` : `/${p.pricing}${p.maxAmount != null && p.pricing !== 'call' ? ` · max ${$(p.maxAmount)}` : ''}`

export type Probe = { ok: boolean; checkedAt: string; error?: string }
/** Hosted listing route: agents call baseUrl + path directly. Price informational (middleware enforces). */
export type Route = { method: string; path: string; price: number; pricing: Pricing['pricing']; maxAmount?: number; passSeconds?: number; description: string; example?: string; probe?: Probe }
/** Public catalog row. hosted: url = base url, routes = live routes only. */
export type Listing = Pricing & { id: string; name: string; description: string | null; category: string | null; verified: boolean; seller: string; mode: 'proxy' | 'hosted'; url: string; routes?: (Route & { url: string })[]; docs?: string }
export const routePrice = (r: Route) => `${$(r.price)}${per({ maxAmount: null, passSeconds: null, ...r })}`
/** curl for a listing: first route (example path if templated) or the paid proxy url. */
export const exampleCall = (l: Listing) => {
  const r = l.routes?.[0]
  return r ? `curl -i ${r.method === 'GET' ? '' : `-X ${r.method} `}${r.example ? l.url + r.example : r.url}` : `curl -i ${l.url}`
}

export type Role = 'buyer' | 'seller'

async function call<T>(url: string, init: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: init.body ? { 'Content-Type': 'application/json' } : {},
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    throw new Error(typeof e === 'string' ? e : e?.issues?.map((i: { message: string }) => i.message).join(', ') ?? `HTTP ${res.status}`)
  }
  return data as T
}

export const pc = <T>(role: Role, path: string, init: { method?: string; body?: unknown } = {}) =>
  call<T>(`/api/pc/${role}/${path.replace(/^\//, '')}`, init)

export const enable = (body: { role: 'buyer' } | { role: 'seller'; name: string; paypalEmail: string }) =>
  call<{ ownerId?: string; sellerId?: string }>('/api/pc/enable', { body })

export const events = (role: Role) => new EventSource(`/api/pc/${role}/events`)

import { env } from './env'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${status} ${JSON.stringify(body)}`)
  }
}

export async function api<T = any>(method: string, path: string, opts: { key?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${env.api}${path}`, {
    method,
    headers: {
      ...(opts.key && { authorization: `Bearer ${opts.key}` }),
      ...(opts.body !== undefined && { 'content-type': 'application/json' }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

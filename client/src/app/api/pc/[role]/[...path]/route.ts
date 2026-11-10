import { auth } from '@/lib/auth'

const API = process.env.PAYCALL_API_URL!.replace(/\/$/, '')
const ALLOW: Record<string, RegExp> = {
  buyer: /^(owners\/me|agents|topup|entries|events|device|oauth)(\/|$)/,
  seller: /^(sellers\/me|endpoints|entries|events)(\/|$)/,
}
const err = (error: string, status: number) => Response.json({ error }, { status })

async function handler(req: Request, { params }: { params: Promise<{ role: string; path: string[] }> }) {
  const { role, path } = await params
  const p = path.map(encodeURIComponent).join('/')
  if (!ALLOW[role]?.test(p) || path.some((s) => s === '.' || s === '..')) return err('not_found', 404)

  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) return err('unauthorized', 401)
  const id = role === 'buyer' ? session.user.ownerId : session.user.sellerId
  if (!id) return err('not_enabled', 404)

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text()
  const up = await fetch(`${API}/${p}${new URL(req.url).search}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${process.env.PAYCALL_SERVICE_KEY}`,
      'x-paycall-as': `${role === 'buyer' ? 'owner' : 'seller'}:${id}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body || undefined,
    signal: req.signal,
    cache: 'no-store',
  })
  const type = up.headers.get('content-type') ?? 'application/json'
  let out = up.body
  // next holds headers till first chunk; upstream SSE silent till first event → send comment now
  if (out && type.startsWith('text/event-stream'))
    out = out.pipeThrough(new TransformStream({ start: (c) => c.enqueue(new TextEncoder().encode(': ok\n\n')) }))
  // no-transform stops compression buffering
  return new Response(out, {
    status: up.status,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE }

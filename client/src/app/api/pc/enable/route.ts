import { auth } from '@/lib/auth'

const API = process.env.PAYCALL_API_URL!.replace(/\/$/, '')
const err = (error: string, status: number) => Response.json({ error }, { status })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) return err('unauthorized', 401)
  const u = session.user
  const b = await req.json().catch(() => null)

  let path: string, input: object, field: 'ownerId' | 'sellerId'
  if (b?.role === 'buyer') {
    if (u.ownerId) return Response.json({ ownerId: u.ownerId })
    // ponytail: owners.email unique server-side; synthetic per-user email, real email never needed by API
    ;[path, input, field] = ['owners', { email: `u_${u.id}@users.paycall` }, 'ownerId']
  } else if (b?.role === 'seller') {
    if (u.sellerId) return Response.json({ sellerId: u.sellerId })
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    const paypalEmail = typeof b.paypalEmail === 'string' ? b.paypalEmail.trim() : ''
    if (!name || name.length > 100) return err('name required', 400)
    if (!EMAIL.test(paypalEmail)) return err('valid paypalEmail required', 400)
    ;[path, input, field] = ['sellers', { name, paypalEmail }, 'sellerId']
  } else return err('role must be buyer or seller', 400)

  const up = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await up.json().catch(() => null)
  if (!up.ok) return Response.json(data ?? { error: `upstream ${up.status}` }, { status: up.status })
  // apiKey discarded; service key acts as user
  const ctx = await auth.$context
  await ctx.internalAdapter.updateUser(u.id, { [field]: data.id })
  return Response.json({ [field]: data.id })
}

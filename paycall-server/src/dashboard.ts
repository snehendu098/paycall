import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { Hono } from 'hono'
import { Pool } from 'pg'
import { z } from 'zod'
import { owners, sellers } from './db/schema'
import { newApiKey } from './lib/auth'
import { randomId, sha256 } from './lib/util'
import type { AppEnv } from './types'

type App = { fetch: (req: Request, env: CloudflareBindings, ctx: ExecutionContext) => Response | Promise<Response> }

// resend rest api, no sdk. no key → log code (local dev)
async function sendCode(env: CloudflareBindings, email: string, otp: string) {
  if (!env.RESEND_API_KEY) return console.log(`[otp] ${email} → ${otp}`)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: email,
      subject: `${otp} is your PayCall code`,
      text: `Your PayCall sign-in code: ${otp}\n\nExpires in 5 minutes. Didn't ask for it? Ignore this email.`,
    }),
  })
  if (!r.ok) console.error('resend failed', r.status, await r.text())
}

// dashboard proxies /api/* here (next rewrite) → cookies first-party on dashboard origin
export function makeAuth(env: CloudflareBindings) {
  const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 1 })
  const auth = betterAuth({
    database: pool,
    baseURL: env.DASHBOARD_ORIGIN,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.DASHBOARD_ORIGIN],
    advanced: { database: { validateSchema: false } }, // instance per request: skip extra schema query
    user: {
      additionalFields: {
        ownerId: { type: 'string', required: false, input: false },
        sellerId: { type: 'string', required: false, input: false },
      },
    },
    // email otp = login + signup in one (unknown email → new user)
    plugins: [emailOTP({ sendVerificationOTP: ({ email, otp }) => sendCode(env, email, otp) })],
  })
  return { auth, end: () => pool.end() }
}

const ALLOW: Record<string, RegExp> = {
  buyer: /^(owners\/me|agents|approvals|disputes|topup|entries|events|device|oauth)(\/|$)/,
  seller: /^(sellers\/me|endpoints|entries|disputes|events)(\/|$)/,
  admin: /^(disputes|endpoints|stats)(\/|$)/, // → /admin/*. settle-now stays bearer-only
}
// admin = verified session email listed in ADMIN_EMAILS (exact, case-insensitive)
const isAdmin = (env: CloudflareBindings, u: { email: string; emailVerified: boolean }) =>
  u.emailVerified && (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(u.email.toLowerCase())
const Enable = z.discriminatedUnion('role', [
  z.object({ role: z.literal('buyer') }),
  z.object({ role: z.literal('seller'), name: z.string().trim().min(1).max(64), paypalEmail: z.email() }),
])

export const dashboard = (app: App) =>
  new Hono<AppEnv>()
    .use(async (c, next) => {
      const { auth, end } = makeAuth(c.env)
      c.set('auth', auth)
      try {
        await next()
      } finally {
        c.executionCtx.waitUntil(end())
      }
    })
    .on(['GET', 'POST'], '/auth/*', (c) => c.var.auth.handler(c.req.raw))

    // first visit to a portal: create owner/seller, link to user. api key discarded, session acts as user
    .post('/pc/enable', async (c) => {
      const s = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
      if (!s) return c.json({ error: 'unauthorized' }, 401)
      const b = Enable.safeParse(await c.req.json().catch(() => null))
      if (!b.success) return c.json({ error: b.error }, 400)
      const u = s.user as typeof s.user & { ownerId?: string; sellerId?: string }
      const apiKeyHash = await sha256(newApiKey(b.data.role === 'buyer' ? 'owner' : 'seller'))
      let field: 'ownerId' | 'sellerId', id: string
      if (b.data.role === 'buyer') {
        if (u.ownerId) return c.json({ ownerId: u.ownerId })
        ;[field, id] = ['ownerId', randomId('own')]
        // ponytail: owners.email unique; synthetic per-user email, real one never needed by api
        await c.var.db.insert(owners).values({ id, email: `u_${u.id}@users.paycall`, apiKeyHash })
      } else {
        if (u.sellerId) return c.json({ sellerId: u.sellerId })
        ;[field, id] = ['sellerId', randomId('sel')]
        await c.var.db.insert(sellers).values({ id, name: b.data.name, paypalEmail: b.data.paypalEmail, apiKeyHash })
      }
      await (await c.var.auth.$context).internalAdapter.updateUser(u.id, { [field]: id })
      return c.json({ [field]: id })
    })

    // nav: show admin link
    .get('/pc/me', async (c) => {
      const s = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
      if (!s) return c.json({ error: 'unauthorized' }, 401)
      return c.json({ admin: isAdmin(c.env, s.user) })
    })

    // session → service principal, dispatched in-process to the api
    .all('/pc/:role/*', async (c) => {
      const role = c.req.param('role')
      const url = new URL(c.req.url)
      const path = url.pathname.slice(`/api/pc/${role}/`.length)
      if (!ALLOW[role]?.test(path) || path.split('/').some((p) => p === '.' || p === '..')) return c.json({ error: 'not_found' }, 404)
      const s = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
      if (!s) return c.json({ error: 'unauthorized' }, 401)
      const u = s.user as typeof s.user & { ownerId?: string; sellerId?: string }
      let headers: Headers
      if (role === 'admin') {
        if (!isAdmin(c.env, u)) return c.json({ error: 'forbidden' }, 403)
        headers = new Headers({ authorization: `Bearer ${c.env.ADMIN_KEY}` })
      } else {
        const id = role === 'buyer' ? u.ownerId : u.sellerId
        if (!id) return c.json({ error: 'not_enabled' }, 404)
        headers = new Headers({ authorization: `Bearer ${c.env.PAYCALL_SERVICE_KEY}`, 'x-paycall-as': `${role === 'buyer' ? 'owner' : 'seller'}:${id}` })
      }
      const type = c.req.header('content-type')
      if (type) headers.set('content-type', type)
      const res = await app.fetch(new Request(`${url.origin}/${role === 'admin' ? 'admin/' : ''}${path}${url.search}`, { method: c.req.method, headers, body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer(), signal: c.req.raw.signal }), c.env, c.executionCtx as ExecutionContext)
      // no-transform: proxies don't buffer sse
      const out = new Response(res.body, res)
      out.headers.set('cache-control', 'no-cache, no-transform')
      return out
    })

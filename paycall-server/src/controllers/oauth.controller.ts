import { authorizationErrorRedirect, AuthorizationError, type AuthRequest } from '@cloudflare/workers-oauth-provider'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { generateKey } from 'paycall-sdk'
import { z } from 'zod'
import { agents } from '../db/schema'
import { factory } from '../lib/factory'
import { zMicros } from '../lib/util'

// hosted mcp oauth: worker validates request, dashboard (better auth session) shows consent, worker completes.
export type McpProps = { ownerId: string; agentPubkey: string; privateKey: string }
type Tx = { req: AuthRequest; clientName: string | null }

const TX_TTL_S = 600
const SCOPES = ['mcp', 'offline_access']
// phishing guard: any site can register a client via dcr/cimd, so only codes to local apps or claude.
// ponytail: fixed allowlist, add hosts when other mcp clients need them
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const okRedirect = (u: URL) => LOOPBACK.has(u.hostname) || /(^|\.)claude\.(ai|com)$/.test(u.hostname)
const txKey = (id: string) => `pctx:${id}` // prefix ≠ oauth lib keys

// public GET /authorize (claude code opens this in browser)
export const authorize = factory.createHandlers(async (c) => {
  const oauth = c.env.OAUTH_PROVIDER
  let req: AuthRequest
  try {
    req = await oauth.parseAuthRequest(c.req.raw) // client, redirect, pkce, resource checks
  } catch (e) {
    if (e instanceof AuthorizationError && e.redirectTo) return c.redirect(e.redirectTo)
    return c.text(`invalid authorization request: ${(e as Error).message}`, 400)
  }
  if (!okRedirect(new URL(req.redirectUri))) return c.text('redirect_uri not allowed: PayCall only signs in local apps and Claude', 400)
  const client = await oauth.lookupClient(req.clientId)
  const id = crypto.randomUUID()
  await c.env.OAUTH_KV.put(txKey(id), JSON.stringify({ req, clientName: client?.clientName ?? null } satisfies Tx), { expirationTtl: TX_TTL_S })
  return c.redirect(`${c.env.DASHBOARD_ORIGIN}/app/authorize?tx=${id}`)
})

async function load(c: { env: CloudflareBindings }, id: string, take = false) {
  const tx = await c.env.OAUTH_KV.get<Tx>(txKey(id), 'json')
  if (!tx) throw new HTTPException(404, { message: 'sign-in expired or already used' })
  // ponytail: kv get+delete not atomic, double-submit race → 2 grants for same owner, harmless
  if (take) await c.env.OAUTH_KV.delete(txKey(id))
  return tx
}

// owner (dashboard bff): what am i approving?
export const get = factory.createHandlers(async (c) => {
  const { req, clientName } = await load(c, c.req.param('id')!)
  return c.json({ clientName, redirectHost: new URL(req.redirectUri).host, scope: req.scope })
})

// owner: approve → per-grant agent key, private key only inside token-encrypted props
export const complete = factory.createHandlers(
  zValidator('json', z.object({ name: z.string().trim().min(1).max(64), maxPrice: zMicros.optional() })),
  async (c) => {
    const ownerId = c.var.principal.id
    const { name, maxPrice } = c.req.valid('json')
    const { req, clientName } = await load(c, c.req.param('id')!, true)
    const kp = await generateKey()
    await c.var.db.insert(agents).values({ pubkey: kp.pubkey, name, ownerId, ...(maxPrice !== undefined && { maxPrice }) })
    const scope = req.scope.filter((s) => SCOPES.includes(s))
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: req,
      userId: ownerId,
      metadata: { clientName, agent: kp.pubkey },
      scope: scope.length ? scope : ['mcp'],
      props: { ownerId, agentPubkey: kp.pubkey, privateKey: kp.privateKey } satisfies McpProps,
      // keep other grants: same client on 2 machines = 2 agents
      revokeExistingGrants: false,
    })
    return c.json({ redirectTo })
  },
)

// owner: deny → client gets access_denied
export const deny = factory.createHandlers(async (c) => {
  const { req } = await load(c, c.req.param('id')!, true)
  return c.json({ redirectTo: authorizationErrorRedirect(req, 'access_denied') })
})

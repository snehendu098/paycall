import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { authorize } from './controllers/oauth.controller'
import { connect } from './db'
import { mcpHandler } from './mcp'
import { settleAll } from './payouts'
import { adminRoute } from './routes/admin.route'
import { agentRoute } from './routes/agent.route'
import { approvalRoute } from './routes/approval.route'
import { search as catalog } from './controllers/catalog.controller'
import { channelRoute } from './routes/channel.route'
import { deviceRoute } from './routes/device.route'
import { endpointRoute } from './routes/endpoint.route'
import { oauthRoute } from './routes/oauth.route'
import { entryRoute } from './routes/entry.route'
import { eventRoute } from './routes/event.route'
import { ownerRoute } from './routes/owner.route'
import { proxyRoute } from './routes/proxy.route'
import { sellerRoute } from './routes/seller.route'
import { topupRoute } from './routes/topup.route'
import { webhookRoute } from './routes/webhook.route'
import { x402Route } from './routes/x402.route'
import type { AppEnv } from './types'

const pgCode = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code

const app = new Hono<AppEnv>()
  .use(cors({ origin: (origin, c) => (origin === c.env.DASHBOARD_ORIGIN ? origin : null) }))
  .use(async (c, next) => {
    const { db, close } = await connect(c.env.HYPERDRIVE.connectionString)
    c.set('db', db)
    c.set('closeDb', close)
    await next()
    // sse closes own conn when stream ends
    if (!c.res.headers.get('content-type')?.startsWith('text/event-stream')) c.executionCtx.waitUntil(close())
  })
  .get('/', (c) => c.json({ name: 'paycall', ok: true }))
  .route('/', x402Route)
  .route('/owners', ownerRoute)
  .route('/agents', agentRoute)
  .route('/sellers', sellerRoute)
  .route('/entries', entryRoute)
  .route('/events', eventRoute)
  .route('/topup', topupRoute)
  .route('/webhooks', webhookRoute)
  .route('/admin', adminRoute)
  .route('/endpoints', endpointRoute)
  .route('/channels', channelRoute)
  .route('/device', deviceRoute)
  .get('/authorize', ...authorize)
  .route('/oauth', oauthRoute)
  .route('/approvals', approvalRoute)
  .get('/catalog', ...catalog)
  .route('/p', proxyRoute)
  .onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    if (pgCode(err) === '23505') return c.json({ error: 'already_exists' }, 409)
    console.error(err)
    return c.json({ error: 'internal_error' }, 500)
  })

const mcp = mcpHandler(app)
// resource = request origin → same code on wrangler dev + prod
const provider = (origin: string) =>
  new OAuthProvider<CloudflareBindings>({
    apiRoute: '/mcp',
    apiHandler: mcp,
    defaultHandler: app,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: ['mcp', 'offline_access'],
    resourceMetadata: { resource: `${origin}/mcp`, resource_name: 'PayCall' },
  })

export default {
  fetch: (req, env, ctx) => provider(new URL(req.url).origin).fetch(req, env, ctx),
  scheduled: (_ctrl, env, ctx) => ctx.waitUntil(settleAll(env)),
} satisfies ExportedHandler<CloudflareBindings>

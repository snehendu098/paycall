import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { connect } from './db'
import { settleAll } from './payouts'
import { adminRoute } from './routes/admin.route'
import { agentRoute } from './routes/agent.route'
import { channelRoute } from './routes/channel.route'
import { endpointRoute } from './routes/endpoint.route'
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
  .route('/p', proxyRoute)
  .onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    if (pgCode(err) === '23505') return c.json({ error: 'already_exists' }, 409)
    console.error(err)
    return c.json({ error: 'internal_error' }, 500)
  })

export default {
  fetch: app.fetch,
  scheduled: (_ctrl, env, ctx) => ctx.waitUntil(settleAll(env)),
} satisfies ExportedHandler<CloudflareBindings>

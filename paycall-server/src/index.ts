import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { timingSafeEqual } from 'hono/utils/buffer'
import { connect, withDb } from './db'
import { pollPayouts, runSettlement } from './payouts'
import { accounts } from './routes/accounts'
import { events } from './routes/events'
import { topup } from './routes/topup'
import { webhooks } from './routes/webhooks'
import { x402 } from './routes/x402'
import type { AppEnv } from './types'

const pgCode = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code

const settle = async (env: CloudflareBindings) =>
  withDb(env.HYPERDRIVE.connectionString, async (db) => {
    await pollPayouts(env, db)
    return runSettlement(env, db)
  })

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
  .route('/', x402)
  .route('/', accounts)
  .route('/topup', topup)
  .route('/webhooks', webhooks)
  .route('/events', events)
  .post(
    '/admin/settle-now',
    bearerAuth<AppEnv>({ verifyToken: (t, c) => !!c.env.ADMIN_KEY && timingSafeEqual(t, c.env.ADMIN_KEY) }),
    async (c) => c.json({ batchId: await settle(c.env) }),
  )
  .onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    if (pgCode(err) === '23505') return c.json({ error: 'already_exists' }, 409)
    console.error(err)
    return c.json({ error: 'internal_error' }, 500)
  })

export default {
  fetch: app.fetch,
  scheduled: (_ctrl, env, ctx) => ctx.waitUntil(settle(env)),
} satisfies ExportedHandler<CloudflareBindings>

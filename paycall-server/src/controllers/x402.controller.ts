import { zValidator } from '@hono/zod-validator'
import { withDb } from '../db'
import { factory } from '../lib/factory'
import { checkPayment, NETWORK, PaymentBody, SCHEME, settlePayment } from '../payments'
import { autoReload } from '../topups'

export const supported = factory.createHandlers((c) =>
  c.json({ kinds: [{ x402Version: 2, scheme: SCHEME, network: NETWORK }], extensions: [], signers: {} }),
)

export const verify = factory.createHandlers(zValidator('json', PaymentBody), async (c) => {
  const body = c.req.valid('json')
  const payer = body.paymentPayload.payload.payer
  const r = await checkPayment(c.var.db, c.var.principal.id, body)
  return c.json(r.ok ? { isValid: true, payer } : { isValid: false, invalidReason: r.reason, payer })
})

export const settle = factory.createHandlers(zValidator('json', PaymentBody), async (c) => {
  const body = c.req.valid('json')
  const payer = body.paymentPayload.payload.payer
  const r = await settlePayment(c.var.db, c.var.principal.id, body)
  if (!r.ok) return c.json({ success: false, errorReason: r.reason, payer, transaction: '', network: NETWORK })

  // own conn: request conn closes before this finishes
  if (r.needsReload)
    c.executionCtx.waitUntil(withDb(c.env.HYPERDRIVE.connectionString, (db) => autoReload(c.env, db, r.ownerId)).catch(console.error))
  return c.json({ success: true, payer, transaction: String(r.entryId), network: NETWORK })
})

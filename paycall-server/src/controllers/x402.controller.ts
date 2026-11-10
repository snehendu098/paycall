import { zValidator } from '@hono/zod-validator'
import { factory } from '../lib/factory'
import { checkPayment, NETWORK, PaymentBody, SCHEME, settlePayment } from '../payments'
import { reloadAfterSettle } from '../topups'

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

  reloadAfterSettle(c, r)
  return c.json({ success: true, payer, transaction: String(r.entryId), network: NETWORK })
})

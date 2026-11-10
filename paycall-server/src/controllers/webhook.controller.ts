import { factory } from '../lib/factory'
import { verifyWebhook } from '../lib/paypal'
import { toMicros } from '../lib/util'
import { applyPayoutItem } from '../payouts'
import { creditTopup, failTopup } from '../topups'

type PayPalEvent = {
  event_type: string
  resource: {
    id: string
    custom_id?: string
    amount?: { value: string }
    transaction_status?: string
    payout_item_id?: string
    payout_item?: { sender_item_id: string }
  }
}

// handlers idempotent → paypal retries safe, no dedupe table
export const paypal = factory.createHandlers(async (c) => {
  const event = await c.req.json<PayPalEvent>()
  if (!(await verifyWebhook(c.env, (n) => c.req.header(n), event))) {
    // all paypal hooks failing → check PAYPAL_WEBHOOK_ID
    console.warn('webhook bad signature', event.event_type)
    return c.json({ error: 'bad_signature' }, 400)
  }

  const db = c.var.db
  const r = event.resource
  switch (event.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      if (r.custom_id && r.amount) await creditTopup(db, r.custom_id, r.id, toMicros(r.amount.value))
      break
    case 'PAYMENT.CAPTURE.DECLINED':
      if (r.custom_id) await failTopup(db, r.custom_id)
      break
    default:
      if (event.event_type.startsWith('PAYMENT.PAYOUTS-ITEM.') && r.payout_item && r.transaction_status)
        await applyPayoutItem(db, r.payout_item.sender_item_id, r.transaction_status, r.payout_item_id)
  }
  return c.json({ ok: true })
})

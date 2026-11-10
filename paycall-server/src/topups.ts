import { and, eq, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { withDb, type DB } from './db'
import { entries, owners, topups } from './db/schema'
import { paypal, type Order } from './lib/paypal'
import { randomId, toDollars, toMicros } from './lib/util'
import type { AppEnv } from './types'

type Env = CloudflareBindings
type Owner = typeof owners.$inferSelect

const usd = (micros: number) => ({ currency_code: 'USD', value: toDollars(micros) })
const firstCapture = (order: Order) => order.purchase_units[0]?.payments?.captures?.[0]

// first top-up also vaults wallet w/ auto-reload plan
function vaultedOrder(env: Env, owner: Owner, topupId: string, amount: number) {
  return {
    intent: 'CAPTURE',
    purchase_units: [
      {
        custom_id: topupId,
        amount: { ...usd(amount), breakdown: { item_total: usd(amount) } },
        items: [
          {
            name: 'Billing Plan',
            quantity: '1',
            category: 'DIGITAL_GOODS',
            unit_amount: usd(amount),
            billing_plan: {
              billing_cycles: [
                {
                  tenure_type: 'REGULAR',
                  sequence: 1,
                  total_cycles: 0,
                  pricing_scheme: {
                    pricing_model: 'AUTO_RELOAD',
                    price: usd(amount),
                    reload_threshold_amount: usd(owner.reloadBelow),
                  },
                },
              ],
            },
          },
        ],
      },
    ],
    payment_source: {
      paypal: {
        attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT', usage_pattern: 'UNSCHEDULED_PREPAID' } },
        experience_context: {
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: `${env.DASHBOARD_ORIGIN}/topup/return`,
          cancel_url: `${env.DASHBOARD_ORIGIN}/topup/cancel`,
        },
      },
    },
  }
}

export async function createTopup(env: Env, db: DB, owner: Owner, amount: number) {
  const id = randomId('tu')
  await db.insert(topups).values({ id, ownerId: owner.id, kind: 'manual', amount })

  const body = owner.vaultId
    ? { intent: 'CAPTURE', purchase_units: [{ custom_id: id, amount: usd(amount) }] }
    : vaultedOrder(env, owner, id, amount)
  const order = await paypal<Order>(env, 'POST', '/v2/checkout/orders', body, id)

  await db.update(topups).set({ paypalOrderId: order.id }).where(eq(topups.id, id))
  return order.id
}

export async function captureTopup(env: Env, db: DB, ownerId: string, orderId: string) {
  const [t] = await db
    .select()
    .from(topups)
    .where(and(eq(topups.paypalOrderId, orderId), eq(topups.ownerId, ownerId)))
  if (!t) throw new HTTPException(404, { message: 'unknown order' })

  const order = await paypal<Order>(env, 'POST', `/v2/checkout/orders/${orderId}/capture`, {}, `cap_${t.id}`)

  // APPROVED = vault not done yet, VAULT.PAYMENT-TOKEN.CREATED would finish it
  const vault = order.payment_source?.paypal?.attributes?.vault
  if (vault?.status === 'VAULTED' && vault.id)
    await db.update(owners).set({ vaultId: vault.id, paypalCustomerId: vault.customer?.id }).where(eq(owners.id, ownerId))

  const cap = firstCapture(order)
  if (cap?.status === 'COMPLETED') await creditTopup(db, t.id, cap.id, toMicros(cap.amount.value))
  return { status: cap?.status ?? order.status, vaulted: vault?.status === 'VAULTED' }
}

// idempotent: capture response + webhook both call this
export async function creditTopup(db: DB, topupId: string, captureId: string, amount: number) {
  return db.transaction(async (tx) => {
    const [t] = await tx
      .update(topups)
      .set({ status: 'completed', captureId })
      .where(and(eq(topups.id, topupId), eq(topups.status, 'pending')))
      .returning()
    if (!t) return false

    await tx.insert(entries).values({ type: t.kind === 'auto' ? 'reload' : 'topup', amount, ownerId: t.ownerId, ref: `cap:${captureId}` })
    await tx.update(owners).set({ balance: sql`${owners.balance} + ${amount}` }).where(eq(owners.id, t.ownerId))
    return true
  })
}

export const failTopup = (db: DB, topupId: string) =>
  db.update(topups).set({ status: 'failed' }).where(and(eq(topups.id, topupId), eq(topups.status, 'pending')))

// merchant-initiated charge on vaulted wallet, no buyer present
export async function autoReload(env: Env, db: DB, ownerId: string) {
  const [o] = await db.select().from(owners).where(eq(owners.id, ownerId))
  if (!o?.vaultId || o.balance >= o.reloadBelow) return

  const id = randomId('tu')
  // partial unique index → one in-flight reload per owner
  const [t] = await db.insert(topups).values({ id, ownerId, kind: 'auto', amount: o.reloadAmount }).onConflictDoNothing().returning()
  if (!t) return

  try {
    const order = await paypal<Order>(
      env,
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [{ custom_id: id, amount: usd(o.reloadAmount) }],
        payment_source: {
          paypal: {
            vault_id: o.vaultId,
            stored_credential: { payment_initiator: 'MERCHANT', usage: 'SUBSEQUENT', usage_pattern: 'UNSCHEDULED_PREPAID' },
          },
        },
      },
      id,
    )
    await db.update(topups).set({ paypalOrderId: order.id }).where(eq(topups.id, id))

    const cap = firstCapture(order)
    if (cap?.status === 'COMPLETED') await creditTopup(db, id, cap.id, toMicros(cap.amount.value))
    else if (cap?.status !== 'PENDING') await failTopup(db, id) // PENDING → webhook finishes
  } catch (e) {
    await failTopup(db, id)
    throw e
  }
}

// after settle. own conn: request conn closes before this finishes
export function reloadAfterSettle(c: Context<AppEnv>, r: { needsReload: boolean; ownerId: string }) {
  if (r.needsReload)
    c.executionCtx.waitUntil(withDb(c.env.HYPERDRIVE.connectionString, (db) => autoReload(c.env, db, r.ownerId)).catch(console.error))
}

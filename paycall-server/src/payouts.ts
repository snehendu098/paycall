import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { withDb, type DB } from './db'
import { agentNonces, channels, entries, payoutBatches, payoutItems, sellers } from './db/schema'
import { paypal, PayPalError } from './lib/paypal'
import { expireDisputes, heldOf, refundedOf } from './ledger'
import { floorCents, randomId, toDollars } from './lib/util'

type Env = CloudflareBindings

const SETTLEMENT_LOCK = 4020
const FAILED = ['FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED', 'DENIED']

// reserve owed per seller, send one paypal payouts batch
export async function runSettlement(env: Env, db: DB) {
  const batchId = randomId('pb')

  const due = await db.transaction(async (tx) => {
    // serialize cron vs settle-now → no double reserve
    await tx.execute(sql`select pg_advisory_xact_lock(${SETTLEMENT_LOCK})`)
    const owed = await tx
      .select({
        id: sellers.id,
        email: sellers.paypalEmail,
        // refunds out, open disputes held back
        owed: sql<number>`coalesce(sum(${channels.cumulative}), 0) - ${sellers.paidOut} - ${sellers.pendingPayout} - ${refundedOf(sellers.id)} - ${heldOf(sellers.id)}`.mapWith(Number),
      })
      .from(sellers)
      .leftJoin(channels, eq(channels.sellerId, sellers.id))
      .groupBy(sellers.id)

    const due = owed
      .filter((s) => s.owed >= env.PAYOUT_MIN_MICROS)
      .map((s) => {
        const gross = floorCents(s.owed) // sub-cent remainder waits for next run
        return { ...s, gross, net: floorCents((gross * (10_000 - env.FEE_BPS)) / 10_000), itemId: randomId('pi') }
      })
    if (!due.length) return due

    await tx.insert(payoutBatches).values({ id: batchId })
    await tx.insert(payoutItems).values(due.map((s) => ({ id: s.itemId, batchId, sellerId: s.id, gross: s.gross, net: s.net })))
    for (const s of due)
      await tx.update(sellers).set({ pendingPayout: sql`${sellers.pendingPayout} + ${s.gross}` }).where(eq(sellers.id, s.id))
    return due
  })
  if (!due.length) return null

  try {
    const res = await paypal<{ batch_header: { payout_batch_id: string; batch_status: string } }>(env, 'POST', '/v1/payments/payouts', {
      sender_batch_header: { sender_batch_id: batchId, email_subject: 'Your PayCall earnings' },
      items: due.map((s) => ({
        recipient_type: 'EMAIL',
        receiver: s.email,
        amount: { value: toDollars(s.net), currency: 'USD' },
        sender_item_id: s.itemId,
        note: 'PayCall API earnings',
      })),
    })
    await db
      .update(payoutBatches)
      .set({ paypalBatchId: res.batch_header.payout_batch_id, status: res.batch_header.batch_status })
      .where(eq(payoutBatches.id, batchId))
    return batchId
  } catch (e) {
    // 4xx = paypal surely refused → release. 5xx/network = unknown, stay reserved
    // ponytail: unknown outcome needs manual check, add batch lookup if it happens
    if (e instanceof PayPalError && e.status < 500) {
      for (const s of due) await applyPayoutItem(db, s.itemId, 'FAILED')
      await db.update(payoutBatches).set({ status: 'FAILED' }).where(eq(payoutBatches.id, batchId))
    }
    throw e
  }
}

// idempotent: webhook + poll both call this
export async function applyPayoutItem(db: DB, itemId: string, transactionStatus: string, paypalItemId?: string) {
  const status = transactionStatus === 'SUCCESS' ? 'paid' : FAILED.includes(transactionStatus) ? 'failed' : null
  if (!status) return false // PENDING/UNCLAIMED/ONHOLD → keep reserved

  return db.transaction(async (tx) => {
    const [item] = await tx
      .update(payoutItems)
      .set({ status, paypalItemId })
      .where(and(eq(payoutItems.id, itemId), eq(payoutItems.status, 'pending')))
      .returning()
    if (!item) return false

    await tx
      .update(sellers)
      .set({
        pendingPayout: sql`${sellers.pendingPayout} - ${item.gross}`,
        ...(status === 'paid' && { paidOut: sql`${sellers.paidOut} + ${item.gross}` }),
      })
      .where(eq(sellers.id, item.sellerId))

    if (status === 'paid')
      await tx.insert(entries).values([
        { type: 'payout', amount: item.net, sellerId: item.sellerId, ref: `payout:${item.id}` },
        { type: 'fee', amount: item.gross - item.net, sellerId: item.sellerId, ref: `fee:${item.id}` },
      ])
    return true
  })
}

type PayoutBatch = {
  batch_header: { batch_status: string }
  items?: { payout_item_id: string; transaction_status: string; payout_item: { sender_item_id: string } }[]
}

// safety net, webhook order undocumented
export async function pollPayouts(env: Env, db: DB) {
  const open = await db
    .select()
    .from(payoutBatches)
    .where(and(isNotNull(payoutBatches.paypalBatchId), inArray(payoutBatches.status, ['PENDING', 'PROCESSING'])))

  for (const b of open) {
    const res = await paypal<PayoutBatch>(env, 'GET', `/v1/payments/payouts/${b.paypalBatchId}`)
    for (const i of res.items ?? []) await applyPayoutItem(db, i.payout_item.sender_item_id, i.transaction_status, i.payout_item_id)
    await db.update(payoutBatches).set({ status: res.batch_header.batch_status }).where(eq(payoutBatches.id, b.id))
  }
}

// cron + /admin/settle-now: own conn, refresh statuses then pay
export const settleAll = (env: CloudflareBindings) =>
  withDb(env.HYPERDRIVE.connectionString, async (db) => {
    await db.delete(agentNonces).where(sql`${agentNonces.createdAt} < now() - interval '10 minutes'`) // past 5 min header window, unverifiable anyway
    await expireDisputes(db) // before payouts: auto-refunds come out of what's owed
    await pollPayouts(env, db)
    return runSettlement(env, db)
  })

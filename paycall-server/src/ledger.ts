// refunds + disputes. one primitive: refund entry = money back to buyer, out of seller earnings.
// voucher/channel math never changes; payouts subtract refunds and open disputes (payouts.ts owed)
import { and, eq, gte, inArray, sql, type AnyColumn } from 'drizzle-orm'
import type { DB } from './db'
import { disputes, entries, owners } from './db/schema'

export const DISPUTE_WINDOW_DAYS = 7
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]
type Fail = { ok: false; reason: string }
const fail = (reason: string): Fail => ({ ok: false, reason })

// per-seller correlated subqueries, used by payouts + seller dashboard
export const refundedOf = (sellerId: AnyColumn | string) =>
  sql<number>`(select coalesce(sum(amount), 0) from entries where seller_id = ${sellerId} and type = 'refund')`.mapWith(Number)
export const heldOf = (sellerId: AnyColumn | string) =>
  sql<number>`(select coalesce(sum(amount), 0) from disputes where seller_id = ${sellerId} and status = 'open')`.mapWith(Number)
// charge +, refund −
export const netAmount = sql<number>`coalesce(sum(case when ${entries.type} = 'charge' then ${entries.amount} else -${entries.amount} end), 0)`.mapWith(Number)

// today's net spend (charges − refunds), for daily caps
export const spentToday = (db: DB, by: { ownerId: string } | { agentPubkey: string }) =>
  db
    .select({ spent: netAmount })
    .from(entries)
    .where(
      and(
        'ownerId' in by ? eq(entries.ownerId, by.ownerId) : eq(entries.agentPubkey, by.agentPubkey),
        inArray(entries.type, ['charge', 'refund']),
        gte(entries.createdAt, sql`date_trunc('day', now())`),
      ),
    )
    .then(([r]) => r!.spent)

// in caller's tx. tag makes it idempotent (unused:<n>, seller:<uuid>, dispute:<id>)
export async function refundIn(tx: Tx, chargeId: number, sellerId: string, amount: number | 'rest', tag: string) {
  const [charge] = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.id, chargeId), eq(entries.type, 'charge'), eq(entries.sellerId, sellerId)))
    .for('update') // serialize refunds of one charge
  if (!charge) return fail('unknown_charge')
  const [{ refunded }] = await tx
    .select({ refunded: sql<number>`coalesce(sum(${entries.amount}), 0)`.mapWith(Number) })
    .from(entries)
    .where(and(eq(entries.parentId, chargeId), eq(entries.type, 'refund')))
  const left = charge.amount - refunded
  const amt = amount === 'rest' ? left : amount
  if (amt <= 0 || amt > left) return fail(left === 0 ? 'already_refunded' : 'refund_exceeds_charge')

  const [entry] = await tx
    .insert(entries)
    .values({ type: 'refund', amount: amt, ownerId: charge.ownerId, sellerId, agentPubkey: charge.agentPubkey, parentId: chargeId, ref: `rf:${chargeId}:${tag}` })
    .onConflictDoNothing()
    .returning({ id: entries.id })
  if (!entry) return fail('duplicate_refund')
  await tx.update(owners).set({ balance: sql`${owners.balance} + ${amt}` }).where(eq(owners.id, charge.ownerId!))
  return { ok: true as const, entryId: entry.id, amount: amt, left: left - amt }
}

export const refund = (db: DB, chargeId: number, sellerId: string, amount: number | 'rest', tag: string) =>
  db.transaction((tx) => refundIn(tx, chargeId, sellerId, amount, tag))

// buyer contests a charge within the window
export async function openDispute(db: DB, ownerId: string, chargeId: number, reason: string) {
  return db.transaction(async (tx) => {
    const [charge] = await tx
      .select()
      .from(entries)
      .where(and(eq(entries.id, chargeId), eq(entries.type, 'charge'), eq(entries.ownerId, ownerId)))
      .for('update')
    if (!charge) return fail('unknown_charge')
    if (Date.now() - +charge.createdAt > DISPUTE_WINDOW_DAYS * 86_400_000) return fail('dispute_window_closed')
    const [{ refunded }] = await tx
      .select({ refunded: sql<number>`coalesce(sum(${entries.amount}), 0)`.mapWith(Number) })
      .from(entries)
      .where(and(eq(entries.parentId, chargeId), eq(entries.type, 'refund')))
    const amount = charge.amount - refunded
    if (amount <= 0) return fail('already_refunded')
    const [d] = await tx
      .insert(disputes)
      .values({ entryId: chargeId, ownerId, sellerId: charge.sellerId!, amount, reason })
      .onConflictDoNothing()
      .returning()
    return d ? { ok: true as const, dispute: d } : fail('already_disputed')
  })
}

// seller decides: refund (money back) or reject (hold released)
export async function resolveDispute(db: DB, sellerId: string, id: number, action: 'refund' | 'reject') {
  return db.transaction(async (tx) => {
    const [d] = await tx
      .update(disputes)
      .set({ status: action === 'refund' ? 'refunded' : 'rejected', resolvedAt: new Date() })
      .where(and(eq(disputes.id, id), eq(disputes.sellerId, sellerId), eq(disputes.status, 'open')))
      .returning()
    if (!d) return fail('unknown_dispute')
    if (action === 'refund') {
      const r = await refundIn(tx, d.entryId, sellerId, 'rest', `dispute:${d.id}`)
      // already fully refunded since opening → nothing left to give back, still resolved
      if (!r.ok && r.reason !== 'already_refunded') throw new Error(r.reason)
    }
    return { ok: true as const, dispute: d }
  })
}

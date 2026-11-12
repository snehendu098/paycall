// needs local pg: DATABASE_URL in .env, migrations applied
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { agents, channels, disputes, entries, owners, payoutBatches, payoutItems, sellers, topups } from '../src/db/schema'
import { closeDispute, decideDispute, escalateDispute, expireDisputes, heldOf, openDispute, refund, refundedOf, spentToday } from '../src/ledger'
import { b64url } from '../src/lib/util'
import { signVoucher } from '../src/lib/voucher'
import { applyPayoutItem } from '../src/payouts'
import { NETWORK, SCHEME, settlePayment, type PaymentBody } from '../src/payments'
import { creditTopup } from '../src/topups'

const { db, close } = await connect(process.env.DATABASE_URL!)
afterAll(close)

const keys = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
const pubkey = b64url(new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer))
const channelId = crypto.randomUUID()
const PRICE = 10_000 // 1¢

beforeEach(async () => {
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, topups, payout_batches, payout_items cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 25_000, dailyCap: 1_000_000 })
  await db.insert(agents).values({ pubkey, ownerId: 'own_1', name: 'bot' })
  await db.insert(sellers).values({ id: 'sel_1', name: 'DataMart', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
})

async function pay(seq: number, cumulative: number, amount = PRICE, mutate?: (b: PaymentBody) => void, conn = db) {
  const req = { scheme: SCHEME, network: NETWORK, amount: String(amount), asset: 'USD', payTo: 'sel_1' } as const
  const payload = await signVoucher(
    { channelId, payer: pubkey, payTo: 'sel_1', cumulativeAmount: String(cumulative), currency: 'USD', seq, expiry: Date.now() / 1000 + 60 | 0 },
    keys.privateKey,
  )
  const body: PaymentBody = { x402Version: 2, paymentPayload: { x402Version: 2, accepted: req, payload }, paymentRequirements: req }
  mutate?.(body)
  return settlePayment(conn, 'sel_1', body)
}

const balance = async () => (await db.select().from(owners).where(eq(owners.id, 'own_1')))[0].balance

test('sequential calls debit + advance channel', async () => {
  expect((await pay(1, PRICE)).ok).toBe(true)
  expect((await pay(2, 2 * PRICE)).ok).toBe(true)
  expect(await balance()).toBe(5_000)
  const [ch] = await db.select().from(channels)
  expect([ch.seq, ch.cumulative]).toEqual([2, 2 * PRICE])
})

test('idempotent: exact same voucher → original result, no 2nd charge; other voucher same seq → stale', async () => {
  const first = await pay(1, PRICE)
  const again = await pay(1, PRICE, PRICE, (b) => (b.paymentPayload.payload = (first as any).voucher ?? b.paymentPayload.payload))
  expect(again).toMatchObject({ ok: true, duplicate: true, entryId: (first as { entryId: number }).entryId })
  expect(await balance()).toBe(15_000)
  expect(await pay(1, PRICE, PRICE, (b) => (b.paymentPayload.payload.expiry += 7))).toMatchObject({ ok: false }) // resigned ≠ settled sig
  expect(await balance()).toBe(15_000)
})

test('refunds: partial, rest, never above charge; caps + payouts net them', async () => {
  const c = (await pay(1, PRICE)) as { entryId: number }
  expect(await refund(db, c.entryId, 'sel_x', 1, 't0')).toMatchObject({ ok: false, reason: 'unknown_charge' }) // other seller
  expect(await refund(db, c.entryId, 'sel_1', 4_000, 't1')).toMatchObject({ ok: true, amount: 4_000, left: 6_000 })
  expect(await refund(db, c.entryId, 'sel_1', 4_000, 't1')).toMatchObject({ ok: false, reason: 'duplicate_refund' })
  expect(await refund(db, c.entryId, 'sel_1', 7_000, 't2')).toMatchObject({ ok: false, reason: 'refund_exceeds_charge' })
  expect(await refund(db, c.entryId, 'sel_1', 'rest', 't3')).toMatchObject({ ok: true, amount: 6_000 })
  expect(await refund(db, c.entryId, 'sel_1', 'rest', 't4')).toMatchObject({ ok: false, reason: 'already_refunded' })
  expect(await balance()).toBe(25_000)
  expect(await spentToday(db, { ownerId: 'own_1' })).toBe(0)
  const [{ r }] = await db.select({ r: refundedOf('sel_1') }).from(sellers)
  expect(r).toBe(PRICE)
})

test('disputes: open holds, reject releases, refund pays back; window + dup guarded', async () => {
  const c = (await pay(1, PRICE)) as { entryId: number }
  expect(await openDispute(db, 'own_x', c.entryId, 'x')).toMatchObject({ ok: false, reason: 'unknown_charge' })
  const d = (await openDispute(db, 'own_1', c.entryId, 'garbage response')) as { ok: true; dispute: { id: number; amount: number } }
  expect(d.dispute.amount).toBe(PRICE)
  expect(await openDispute(db, 'own_1', c.entryId, 'again')).toMatchObject({ ok: false, reason: 'already_disputed' })
  const held = async () => (await db.select({ h: heldOf('sel_1') }).from(sellers))[0]!.h
  expect(await held()).toBe(PRICE)
  expect(await decideDispute(db, d.dispute.id, { seller: 'sel_x' }, 'refund')).toMatchObject({ ok: false })
  expect(await decideDispute(db, d.dispute.id, { seller: 'sel_1' }, 'refund')).toMatchObject({ ok: true })
  expect(await held()).toBe(0)
  expect(await balance()).toBe(25_000)
  expect(await decideDispute(db, d.dispute.id, { seller: 'sel_1' }, 'reject', 'no')).toMatchObject({ ok: false }) // already resolved

  const c2 = (await pay(2, 2 * PRICE)) as { entryId: number }
  await db.update(entries).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(entries.id, c2.entryId))
  expect(await openDispute(db, 'own_1', c2.entryId, 'late')).toMatchObject({ ok: false, reason: 'dispute_window_closed' })
})

test('disputes: seller silence auto-refunds; reject → escalate once → admin final', async () => {
  const held = async () => (await db.select({ h: heldOf('sel_1') }).from(sellers))[0]!.h
  type D = { ok: true; dispute: { id: number } }
  // seller silent 3 days → cron refunds
  const c1 = (await pay(1, PRICE)) as { entryId: number }
  const d1 = (await openDispute(db, 'own_1', c1.entryId, 'empty body')) as D
  await expireDisputes(db)
  expect((await db.select().from(disputes).where(eq(disputes.id, d1.dispute.id)))[0]!.status).toBe('open') // not late yet
  await db.update(disputes).set({ createdAt: new Date(Date.now() - 4 * 86_400_000) }).where(eq(disputes.id, d1.dispute.id))
  await expireDisputes(db)
  expect((await db.select().from(disputes).where(eq(disputes.id, d1.dispute.id)))[0]).toMatchObject({ status: 'refunded', decidedBy: 'timeout' })
  expect(await balance()).toBe(25_000)

  // seller rejects → still held while escalatable; buyer escalates once; admin refunds
  const c2 = (await pay(2, 2 * PRICE)) as { entryId: number }
  const d2 = (await openDispute(db, 'own_1', c2.entryId, 'wrong data')) as D
  expect(await escalateDispute(db, 'own_1', d2.dispute.id)).toMatchObject({ ok: false }) // seller hasn't answered
  expect(await decideDispute(db, d2.dispute.id, 'admin', 'refund')).toMatchObject({ ok: false }) // admin only on escalated
  expect(await decideDispute(db, d2.dispute.id, { seller: 'sel_1' }, 'reject', 'data was correct')).toMatchObject({ ok: true })
  expect(await held()).toBe(PRICE)
  expect(await escalateDispute(db, 'own_x', d2.dispute.id)).toMatchObject({ ok: false })
  expect(await escalateDispute(db, 'own_1', d2.dispute.id)).toMatchObject({ ok: true, dispute: { status: 'escalated' } })
  expect(await escalateDispute(db, 'own_1', d2.dispute.id)).toMatchObject({ ok: false }) // once
  expect(await decideDispute(db, d2.dispute.id, { seller: 'sel_1' }, 'reject', 'again')).toMatchObject({ ok: false }) // out of seller hands
  expect(await decideDispute(db, d2.dispute.id, 'admin', 'refund', 'upstream returned stale data')).toMatchObject({ ok: true, dispute: { decidedBy: 'admin', reply: 'data was correct', adminNote: 'upstream returned stale data' } })
  expect(await held()).toBe(0)
  expect(await balance()).toBe(25_000)

  // seller reject not escalated in time → hold released, can't escalate
  const c3 = (await pay(3, 3 * PRICE)) as { entryId: number }
  const d3 = (await openDispute(db, 'own_1', c3.entryId, 'meh')) as D
  await decideDispute(db, d3.dispute.id, { seller: 'sel_1' }, 'reject', 'works fine')
  await db.update(disputes).set({ resolvedAt: new Date(Date.now() - 4 * 86_400_000) }).where(eq(disputes.id, d3.dispute.id))
  expect(await held()).toBe(0)
  expect(await escalateDispute(db, 'own_1', d3.dispute.id)).toMatchObject({ ok: false, reason: 'not_escalatable' })
})

test('disputes: buyer marks resolved (open or after reject) → no refund, no escalation, hold released', async () => {
  const held = async () => (await db.select({ h: heldOf('sel_1') }).from(sellers))[0]!.h
  type D = { ok: true; dispute: { id: number } }
  const c1 = (await pay(1, PRICE)) as { entryId: number }
  const d1 = (await openDispute(db, 'own_1', c1.entryId, 'oops')) as D
  expect(await closeDispute(db, 'own_x', d1.dispute.id)).toMatchObject({ ok: false })
  expect(await closeDispute(db, 'own_1', d1.dispute.id)).toMatchObject({ ok: true, dispute: { status: 'rejected', decidedBy: 'buyer' } })
  expect(await held()).toBe(0)
  expect(await decideDispute(db, d1.dispute.id, { seller: 'sel_1' }, 'refund')).toMatchObject({ ok: false }) // closed
  const c2 = (await pay(2, 2 * PRICE)) as { entryId: number }
  const d2 = (await openDispute(db, 'own_1', c2.entryId, 'meh')) as D
  await decideDispute(db, d2.dispute.id, { seller: 'sel_1' }, 'reject', 'fine')
  expect(await closeDispute(db, 'own_1', d2.dispute.id)).toMatchObject({ ok: true })
  expect(await escalateDispute(db, 'own_1', d2.dispute.id)).toMatchObject({ ok: false })
  expect(await held()).toBe(0)
  expect(await balance()).toBe(25_000 - 2 * PRICE)
})

test('parallel double-spend → exactly one wins', async () => {
  // own conn each, like separate worker requests
  const conns = await Promise.all(Array.from({ length: 5 }, () => connect(process.env.DATABASE_URL!)))
  const results = await Promise.all(conns.map((c) => pay(1, PRICE, PRICE, undefined, c.db)))
  await Promise.all(conns.map((c) => c.close()))
  expect(results.filter((r) => r.ok).length).toBe(1)
  expect(await balance()).toBe(15_000)
})

test('tampered amount → bad signature', async () => {
  const r = await pay(1, PRICE, PRICE, (b) => (b.paymentPayload.payload.cumulativeAmount = '1'))
  expect(r).toEqual({ ok: false, reason: 'invalid_signature' })
})

test('overdraft + paused + cap blocked', async () => {
  expect(await pay(1, 30_000, 30_000)).toEqual({ ok: false, reason: 'insufficient_funds' })
  await db.update(owners).set({ dailyCap: 5_000 })
  expect(await pay(1, PRICE)).toEqual({ ok: false, reason: 'daily_cap_exceeded' })
  await db.update(agents).set({ paused: true })
  expect(await pay(1, PRICE)).toEqual({ ok: false, reason: 'agent_paused' })
  expect(await balance()).toBe(25_000)
})

test('top-up credit idempotent (capture + webhook)', async () => {
  await db.insert(topups).values({ id: 'tu_1', ownerId: 'own_1', kind: 'manual', amount: 10_000_000 })
  expect(await creditTopup(db, 'tu_1', 'CAP1', 10_000_000)).toBe(true)
  expect(await creditTopup(db, 'tu_1', 'CAP1', 10_000_000)).toBe(false)
  expect(await balance()).toBe(10_025_000)
})

test('one pending auto-reload per owner', async () => {
  await db.insert(topups).values({ id: 'tu_a', ownerId: 'own_1', kind: 'auto', amount: 1 })
  const second = await db.insert(topups).values({ id: 'tu_b', ownerId: 'own_1', kind: 'auto', amount: 1 }).onConflictDoNothing().returning()
  expect(second).toHaveLength(0)
})

test('payout item applied once, failure releases reservation', async () => {
  await db.insert(payoutBatches).values({ id: 'pb_1' })
  await db.insert(payoutItems).values([
    { id: 'pi_ok', batchId: 'pb_1', sellerId: 'sel_1', gross: 1_000_000, net: 980_000 },
    { id: 'pi_bad', batchId: 'pb_1', sellerId: 'sel_1', gross: 500_000, net: 490_000 },
  ])
  await db.update(sellers).set({ pendingPayout: 1_500_000 })

  expect(await applyPayoutItem(db, 'pi_ok', 'SUCCESS')).toBe(true)
  expect(await applyPayoutItem(db, 'pi_ok', 'SUCCESS')).toBe(false)
  expect(await applyPayoutItem(db, 'pi_bad', 'UNCLAIMED')).toBe(false)
  expect(await applyPayoutItem(db, 'pi_bad', 'FAILED')).toBe(true)

  const [s] = await db.select().from(sellers)
  expect([s.paidOut, s.pendingPayout]).toEqual([1_000_000, 0])
})

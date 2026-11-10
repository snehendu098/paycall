// needs local pg: DATABASE_URL in .env, migrations applied
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { agents, channels, owners, payoutBatches, payoutItems, sellers, topups } from '../src/db/schema'
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

test('replay rejected', async () => {
  await pay(1, PRICE)
  expect(await pay(1, PRICE)).toEqual({ ok: false, reason: 'stale_voucher' })
  expect(await balance()).toBe(15_000)
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

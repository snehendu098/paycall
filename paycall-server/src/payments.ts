import { and, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { DB } from './db'
import { agents, channels, entries, owners } from './db/schema'
import { Micros, Voucher, verifyVoucher } from './lib/voucher'

export const SCHEME = 'paycall-prepaid'
export const NETWORK = 'paypal:sandbox'

const Requirements = z.object({
  scheme: z.literal(SCHEME),
  network: z.literal(NETWORK),
  amount: Micros,
  asset: z.literal('USD'),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
})
type Requirements = z.infer<typeof Requirements>

export const PaymentBody = z.object({
  x402Version: z.literal(2),
  paymentPayload: z.object({ x402Version: z.literal(2), accepted: Requirements, payload: Voucher }),
  paymentRequirements: Requirements,
})
export type PaymentBody = z.infer<typeof PaymentBody>

type Fail = { ok: false; reason: string }
const fail = (reason: string): Fail => ({ ok: false, reason })
class Rollback extends Error {}

const sameTerms = (a: Requirements, b: Requirements) =>
  a.scheme === b.scheme && a.network === b.network && a.amount === b.amount && a.asset === b.asset && a.payTo === b.payTo

// read-only, x402 /verify
export async function checkPayment(db: DB, sellerId: string, { paymentPayload, paymentRequirements: req }: PaymentBody) {
  const v = paymentPayload.payload
  const amount = Number(req.amount)

  if (amount <= 0) return fail('invalid_amount')
  if (req.payTo !== sellerId || v.payTo !== sellerId) return fail('invalid_payee')
  if (!sameTerms(paymentPayload.accepted, req)) return fail('requirements_mismatch')
  if (v.expiry * 1000 < Date.now()) return fail('voucher_expired')
  if (!(await verifyVoucher(v))) return fail('invalid_signature')

  const [row] = await db
    .select({ agent: agents, owner: owners })
    .from(agents)
    .innerJoin(owners, eq(owners.id, agents.ownerId))
    .where(eq(agents.pubkey, v.payer))
  if (!row) return fail('unknown_payer')
  const { agent, owner } = row
  if (agent.paused) return fail('agent_paused')
  if (amount > agent.maxPrice) return fail('price_above_agent_limit')

  const [ch] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.agentPubkey, v.payer), eq(channels.sellerId, sellerId)))
  if (ch && ch.id !== v.channelId) return fail('channel_mismatch')
  if (v.seq !== (ch?.seq ?? 0) + 1 || Number(v.cumulativeAmount) !== (ch?.cumulative ?? 0) + amount)
    return fail('stale_voucher')

  if (owner.balance < amount) return fail('insufficient_funds')
  const [{ spent }] = await db
    .select({ spent: sql<number>`coalesce(sum(${entries.amount}), 0)`.mapWith(Number) })
    .from(entries)
    .where(and(eq(entries.ownerId, owner.id), eq(entries.type, 'charge'), gte(entries.createdAt, sql`date_trunc('day', now())`)))
  // ponytail: cap checked outside tx, parallel calls can overshoot by one call. balance never can.
  if (spent + amount > owner.dailyCap) return fail('daily_cap_exceeded')

  return { ok: true as const, voucher: v, amount, owner }
}

// x402 /settle: one tx, db constraints guard money
export async function settlePayment(db: DB, sellerId: string, body: PaymentBody) {
  const check = await checkPayment(db, sellerId, body)
  if (!check.ok) return check
  const { voucher: v, amount, owner } = check

  try {
    return await db.transaction(async (tx) => {
      const [entry] = await tx
        .insert(entries)
        .values({ type: 'charge', amount, ownerId: owner.id, sellerId, agentPubkey: v.payer, ref: `ch:${v.channelId}:${v.seq}` })
        .onConflictDoNothing()
        .returning({ id: entries.id })
      if (!entry) throw new Rollback('duplicate_voucher')

      const [debited] = await tx
        .update(owners)
        .set({ balance: sql`${owners.balance} - ${amount}` })
        .where(and(eq(owners.id, owner.id), gte(owners.balance, amount)))
        .returning({ balance: owners.balance })
      if (!debited) throw new Rollback('insufficient_funds')

      const cumulative = Number(v.cumulativeAmount)
      const next = { cumulative, seq: v.seq, lastSig: v.sig, updatedAt: new Date() }
      const [ch] =
        v.seq === 1
          ? await tx
              .insert(channels)
              .values({ id: v.channelId, agentPubkey: v.payer, sellerId, ...next })
              .onConflictDoNothing()
              .returning({ id: channels.id })
          : await tx
              .update(channels)
              .set(next)
              .where(
                and(
                  eq(channels.id, v.channelId),
                  eq(channels.agentPubkey, v.payer),
                  eq(channels.sellerId, sellerId),
                  eq(channels.seq, v.seq - 1),
                  eq(channels.cumulative, cumulative - amount),
                ),
              )
              .returning({ id: channels.id })
      if (!ch) throw new Rollback('stale_voucher')

      return {
        ok: true as const,
        entryId: entry.id,
        payer: v.payer,
        ownerId: owner.id,
        needsReload: !!owner.vaultId && debited.balance < owner.reloadBelow,
      }
    })
  } catch (e) {
    if (e instanceof Rollback) return fail(e.message)
    throw e
  }
}

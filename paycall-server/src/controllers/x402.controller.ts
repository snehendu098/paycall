import { zValidator } from '@hono/zod-validator'
import { and, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { agentNonces, agents, sellerPasses } from '../db/schema'
import { factory } from '../lib/factory'
import { verifyAgentHeader } from '../lib/voucher'
import { checkPayment, NETWORK, PaymentBody, SCHEME, settlePayment } from '../payments'
import { reloadAfterSettle } from '../topups'

// seller-set time pass, seconds trusted (seller authed)
const Pass = z.object({ seconds: z.number().int().positive().max(30 * 86400), scope: z.string().min(1).max(512) })

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
  const raw = body.paymentRequirements.extra?.pass
  const pass = raw === undefined ? undefined : Pass.safeParse(raw)
  if (pass && !pass.success) return c.json({ error: 'invalid pass' }, 400) // before charge: never paid-without-pass
  const sellerId = c.var.principal.id
  const r = await settlePayment(c.var.db, sellerId, body)
  if (!r.ok) return c.json({ success: false, errorReason: r.reason, payer, transaction: '', network: NETWORK })

  reloadAfterSettle(c, r)
  let passInfo
  if (pass) {
    const { seconds, scope } = pass.data
    const [p] = await c.var.db
      .insert(sellerPasses)
      .values({ agentPubkey: r.payer, sellerId, scope, expiresAt: sql`now() + make_interval(secs => ${seconds})` })
      .onConflictDoUpdate({
        target: [sellerPasses.agentPubkey, sellerPasses.sellerId, sellerPasses.scope],
        set: { expiresAt: sql`greatest(${sellerPasses.expiresAt}, now()) + make_interval(secs => ${seconds})` },
      })
      .returning({ expiresAt: sellerPasses.expiresAt })
    passInfo = { pass: { expiresAt: p!.expiresAt } }
  }
  return c.json({ success: true, payer, transaction: String(r.entryId), network: NETWORK, ...passInfo })
})

const Check = z.object({ identity: z.string().max(512), method: z.string().min(1).max(16), url: z.string().min(1).max(4096), scope: z.string().min(1).max(512) })

// middleware pass holder: signed identity → unexpired pass? nonce burnt like proxy
export const checkPass = factory.createHandlers(zValidator('json', Check), async (c) => {
  const { identity, method, url, scope } = c.req.valid('json')
  const db = c.var.db
  const id = await verifyAgentHeader(identity, method, url)
  const fresh = id && (await db.insert(agentNonces).values({ id: `${id.payer}:${id.nonce}` }).onConflictDoNothing().returning()).length > 0
  if (!fresh) return c.json({ valid: false })
  const [p] = await db
    .select({ expiresAt: sellerPasses.expiresAt })
    .from(sellerPasses)
    .innerJoin(agents, eq(agents.pubkey, sellerPasses.agentPubkey))
    .where(and(eq(sellerPasses.agentPubkey, id.payer), eq(sellerPasses.sellerId, c.var.principal.id), eq(sellerPasses.scope, scope), gt(sellerPasses.expiresAt, sql`now()`), eq(agents.paused, false)))
  return c.json(p ? { valid: true, payer: id.payer, expiresAt: p.expiresAt } : { valid: false })
})

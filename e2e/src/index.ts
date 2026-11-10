import assert from 'node:assert/strict'
import { createAgent } from './agent'
import { api } from './api'
import { env } from './env'
import { approveOrder } from './paypal'

const $ = (micros: number) => `$${(micros / 1e6).toFixed(2)}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const step = (msg: string) => console.log(`\n▸ ${msg}`)
const ok = (msg: string) => console.log(`  ✓ ${msg}`)

async function poll<T>(what: string, fn: () => Promise<T | undefined | false>, timeoutMs = 120_000, everyMs = 3_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const r = await fn()
    if (r) return r
    await sleep(everyMs)
  }
  throw new Error(`timeout: ${what}`)
}

const PRICE = 500_000 // $0.50 per call
const TOPUP = 5_000_000 // $5

console.log(`PayCall e2e → ${env.api}`)

step('signup seller + owner')
// seller paid to sandbox personal acct → payout lands somewhere real
const seller = await api('POST', '/sellers', { body: { name: 'e2e seller', paypalEmail: env.buyerEmail } })
const owner = await api('POST', '/owners', { body: { email: `e2e-${Date.now()}@example.com` } })
ok(`seller ${seller.id}, owner ${owner.id}`)

step('register agent')
const agent = await createAgent()
await api('POST', '/agents', { key: owner.apiKey, body: { pubkey: agent.pubkey, name: 'e2e bot' } })
ok(`agent ${agent.pubkey.slice(0, 12)}…`)

step(`top-up ${$(TOPUP)} via PayPal (vault wallet)`)
const { orderId } = await api('POST', '/topup/create', { key: owner.apiKey, body: { amount: TOPUP } })
ok(`order ${orderId}`)
await approveOrder(orderId)
ok('buyer approved in sandbox checkout')
const cap = await api('POST', '/topup/capture', { key: owner.apiKey, body: { orderId } })
assert.equal(cap.status, 'COMPLETED', `capture ${JSON.stringify(cap)}`)
assert.equal(cap.vaulted, true, 'wallet not vaulted → auto-reload impossible')
let me = await api('GET', '/owners/me', { key: owner.apiKey })
assert.equal(me.owner.balance, TOPUP)
assert.ok(me.owner.vaultId)
ok(`captured, vaulted, balance ${$(me.owner.balance)}`)

step('x402 /verify + /settle until balance dips under reload threshold')
const { reloadBelow, reloadAmount } = me.owner
const calls = Math.floor((TOPUP - reloadBelow) / PRICE) + 1
for (let i = 1; i <= calls; i++) {
  const { body, commit } = await agent.pay(seller.id, PRICE)
  const v = await api('POST', '/verify', { key: seller.apiKey, body })
  assert.equal(v.isValid, true, `verify #${i} ${JSON.stringify(v)}`)
  const s = await api('POST', '/settle', { key: seller.apiKey, body })
  assert.equal(s.success, true, `settle #${i} ${JSON.stringify(s)}`)
  commit()
  if (i === 1) {
    const replay = await api('POST', '/settle', { key: seller.apiKey, body })
    assert.equal(replay.success, false)
    ok(`replay rejected: ${replay.errorReason}`)
  }
}
const spent = calls * PRICE
ok(`${calls} calls settled, ${$(spent)} spent`)

step(`auto-reload (balance < ${$(reloadBelow)} → MIT charge ${$(reloadAmount)})`)
const expected = TOPUP - spent + reloadAmount
me = await poll('auto-reload credit', async () => {
  const r = await api('GET', '/owners/me', { key: owner.apiKey })
  return r.owner.balance === expected && r
})
ok(`balance ${$(me.owner.balance)}`)

step('ledger: capture + webhook credit once')
await sleep(15_000) // let capture webhooks land
const entries: { type: string }[] = await api('GET', '/entries', { key: owner.apiKey })
const count = (t: string) => entries.filter((e) => e.type === t).length
assert.deepEqual([count('topup'), count('reload'), count('charge')], [1, 1, calls])
me = await api('GET', '/owners/me', { key: owner.apiKey })
assert.equal(me.owner.balance, expected, 'webhook double-credited')
ok(`topup 1, reload 1, charge ${calls}, balance still ${$(me.owner.balance)}`)

step('seller payout via PayPal Payouts')
const batchId = await poll('payout batch', async () => (await api('POST', '/admin/settle-now', { key: env.adminKey })).batchId, 30_000)
ok(`batch ${batchId}`)
const paid = await poll(
  'payout SUCCESS',
  async () => {
    await api('POST', '/admin/settle-now', { key: env.adminKey }) // also polls payout status
    const r = await api('GET', '/sellers/me', { key: seller.apiKey })
    if (r.payouts[0]?.status === 'failed') throw new Error(`payout failed ${JSON.stringify(r.payouts[0])}`)
    return r.payouts[0]?.status === 'paid' && r
  },
  180_000,
  10_000,
)
const item = paid.payouts[0]
assert.equal(item.gross, spent)
assert.equal(paid.owed, 0)
ok(`paid ${$(item.net)} (gross ${$(item.gross)} − fee ${$(item.gross - item.net)}), owed ${$(paid.owed)}`)

console.log('\n✅ e2e passed')
process.exit(0)

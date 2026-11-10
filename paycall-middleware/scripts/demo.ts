// money-path check vs local paycall-server: bun scripts/demo.ts (needs wrangler dev :8798 + paycall-pg)
import { $ } from 'bun'
import assert from 'node:assert/strict'
import express from 'express'
import { Hono } from 'hono'
import { createAgent, decodePaymentHeader, generateKey } from 'paycall-sdk'
import { paycallExpress, paycallHono, withPaycall } from '../src'

const facilitator = process.env.FACILITATOR ?? 'http://localhost:8798'
const sql = async (q: string) => (await $`docker exec paycall-pg psql -U paycall -d paycall -tAc ${q}`.text()).trim()

// fresh seller + funded buyer each run
const seller = await (
  await fetch(`${facilitator}/sellers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'demo', paypalEmail: 'demo@example.com' }) })
).json() as { id: string; apiKey: string }
const key = await generateKey()
const owner = `own_demo_${crypto.randomUUID()}`
await sql(`insert into owners (id, email, api_key_hash, balance) values ('${owner}', '${owner}@x.dev', '${owner}', 1000000)`)
await sql(`insert into agents (pubkey, owner_id, name) values ('${key.pubkey}', '${owner}', 'demo')`)
const balance = async () => Number(await sql(`select balance from owners where id='${owner}'`))
const drain = () => sql(`update owners set balance = 0 where id='${owner}'`) // makes settle fail after verify passed

const opts = { apiKey: seller.apiKey, price: '0.01', facilitator }

// web standard
const web = Bun.serve({
  port: 8811,
  fetch: withPaycall(async (req) => {
    const p = new URL(req.url).pathname
    if (p === '/fail') return new Response('boom', { status: 500 })
    if (p === '/drain') await drain()
    return Response.json({ hello: 'web' })
  }, opts),
})

const app = new Hono()
app.use(paycallHono(opts))
app.get('/fail', (c) => c.text('boom', 500))
app.get('/drain', async (c) => (await drain(), c.json({ hello: 'hono' })))
app.get('/', (c) => c.json({ hello: 'hono' }))
const hono = Bun.serve({ port: 8812, fetch: app.fetch })

const ex = express()
ex.use(paycallExpress(opts))
ex.get('/fail', (_req, res) => void res.status(500).send('boom'))
ex.get('/drain', async (_req, res) => (await drain(), void res.json({ hello: 'express' })))
ex.get('/', (_req, res) => void res.json({ hello: 'express' }))
const exSrv = ex.listen(8813)

const agent = await createAgent(key.privateKey)
for (const [name, base] of [['web', 'http://localhost:8811'], ['hono', 'http://localhost:8812'], ['express', 'http://localhost:8813']]) {
  // unpaid → 402 + requirements
  const r0 = await fetch(base + '/')
  assert.equal(r0.status, 402)
  const pr = decodePaymentHeader(r0.headers.get('payment-required'))
  assert.equal(pr.x402Version, 2)
  assert.equal(pr.error, 'payment_required')
  assert.deepEqual({ ...pr.accepts[0], extra: undefined }, { scheme: 'paycall-prepaid', network: 'paypal:sandbox', amount: '10000', asset: 'USD', payTo: seller.id, maxTimeoutSeconds: 60, extra: undefined })
  assert.equal(pr.accepts[0].extra.facilitator, facilitator)
  await r0.body?.cancel()

  // paid twice (seq 1 + 2) → 200, body, PAYMENT-RESPONSE, -10000 each
  for (let i = 0; i < 2; i++) {
    const before = await balance()
    const r = await agent.fetch(base + '/')
    assert.equal(r.status, 200, `${name} paid ${i}: ${r.status} ${await r.clone().text()}`)
    assert.deepEqual(await r.json(), { hello: name })
    const pay = decodePaymentHeader(r.headers.get('payment-response'))
    assert.equal(pay.success, true)
    assert.equal(pay.payer, key.pubkey)
    assert.equal(pay.network, 'paypal:sandbox')
    assert.ok(pay.transaction)
    assert.equal(await balance(), before - 10000)
  }

  // handler 500 → relayed, no charge
  const before = await balance()
  const rf = await agent.fetch(base + '/fail')
  assert.equal(rf.status, 500)
  assert.equal(await rf.text(), 'boom')
  assert.equal(await balance(), before)

  // settle fails (balance drained mid-handler) → 402, body withheld
  const rd = await agent.fetch(base + '/drain')
  assert.equal(rd.status, 402)
  assert.equal(decodePaymentHeader(rd.headers.get('payment-required')).error, 'insufficient_funds')
  assert.ok(!(await rd.text()).includes('hello'))
  await sql(`update owners set balance = ${before} where id='${owner}'`)

  console.log(`ok ${name}: 402 unpaid, 2x paid -10000, 500 no charge, settle fail withheld`)
}
assert.equal(await balance(), 1000000 - 6 * 10000)
console.log(`ok total: balance ${await balance()} (60000 charged), agent.spent ${agent.spent}`)

web.stop()
hono.stop()
exSrv.close()

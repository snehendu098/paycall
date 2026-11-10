// one-off: verified Channel3 listing on prod. idempotent.
// C3_KEY=... bun --env-file=.env --env-file=.dev.vars scripts/seed-channel3.ts
// db insert for seller only; endpoint goes through the api so the worker seals the key with its own secret
import pg from 'pg'

const API = process.env.API ?? 'https://api.paycall.live'
const SELLER = { id: 'sel_channel3', name: 'Channel3', paypalEmail: 'sb-nrv0w53787834@business.example.com' }
const { DATABASE_URL, PAYCALL_SERVICE_KEY, ADMIN_KEY, C3_KEY } = process.env
if (!DATABASE_URL || !PAYCALL_SERVICE_KEY || !ADMIN_KEY || !C3_KEY) throw new Error('need DATABASE_URL, PAYCALL_SERVICE_KEY, ADMIN_KEY, C3_KEY')

const db = new pg.Client({ connectionString: DATABASE_URL })
await db.connect()
const hash = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex') // no usable api key; seller acts via service key
await db.query('insert into sellers (id, name, paypal_email, api_key_hash) values ($1, $2, $3, $4) on conflict (id) do update set paypal_email = excluded.paypal_email', [SELLER.id, SELLER.name, SELLER.paypalEmail, hash])
await db.end()

const as = { authorization: `Bearer ${PAYCALL_SERVICE_KEY}`, 'x-paycall-as': `seller:${SELLER.id}`, 'content-type': 'application/json' }
const call = async (path: string, init: RequestInit) => {
  const r = await fetch(API + path, init)
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}

const listed = (await call('/endpoints', { headers: as })) as { id: string; name: string }[]
const body = {
  name: 'Channel3 product search',
  upstreamUrl: 'https://api.trychannel3.com/v1',
  price: 5000, // $0.005
  category: 'shopping',
  description: 'Search 100M+ products across 25k retailers: titles, prices, images, buy links. POST {url}/search with JSON {"query":"white sneakers","limit":10}',
  upstreamHeaders: { 'x-api-key': C3_KEY },
}
const prev = listed.find((e) => e.name === body.name)
const ep = (await (prev
  ? call(`/endpoints/${prev.id}`, { method: 'PATCH', headers: as, body: JSON.stringify(body) })
  : call('/endpoints', { method: 'POST', headers: as, body: JSON.stringify(body) }))) as { id: string; hasAuth: boolean }
await call(`/admin/endpoints/${ep.id}/verified`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ verified: true }) })
console.log(`${prev ? 'updated' : 'created'} ${ep.id} hasAuth=${ep.hasAuth} verified=true → ${API}/p/${ep.id}/search`)

// one-off: demo listings for metered streaming + time pass. idempotent (matched by name). verified.
// C3_KEY=... bun --env-file=.env --env-file=.dev.vars scripts/seed-demo.ts
import pg from 'pg'

const API = process.env.API ?? 'https://api.paycall.live'
const EMAIL = 'sb-nrv0w53787834@business.example.com'
const { DATABASE_URL, PAYCALL_SERVICE_KEY, ADMIN_KEY, C3_KEY } = process.env
if (!DATABASE_URL || !PAYCALL_SERVICE_KEY || !ADMIN_KEY || !C3_KEY) throw new Error('need DATABASE_URL, PAYCALL_SERVICE_KEY, ADMIN_KEY, C3_KEY')

const LISTINGS = [
  {
    seller: { id: 'sel_paycall', name: 'PayCall Labs' },
    body: {
      name: 'Story stream (demo LLM)',
      upstreamUrl: `${API}/demo`,
      price: 20, // $0.00002 per char
      pricing: 'char',
      maxAmount: 10_000, // cap $0.01 per call
      category: 'llm',
      description: 'Streams a short story word by word (SSE). Pay per character actually streamed, cap $0.01; unused cap refunded. GET {url}/story',
    },
  },
  {
    seller: { id: 'sel_channel3', name: 'Channel3' },
    body: {
      name: 'Channel3 search · 1h pass',
      upstreamUrl: 'https://api.trychannel3.com/v1',
      price: 100_000, // $0.10 per hour
      pricing: 'pass',
      passSeconds: 3600,
      category: 'shopping',
      description: 'Unlimited product searches for one hour after one payment. POST {url}/search with JSON {"query":"white sneakers","limit":10}',
      upstreamHeaders: { 'x-api-key': C3_KEY },
    },
  },
]

const db = new pg.Client({ connectionString: DATABASE_URL })
await db.connect()
for (const { seller } of LISTINGS) {
  const hash = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex') // unusable key; acts via service key
  await db.query('insert into sellers (id, name, paypal_email, api_key_hash) values ($1, $2, $3, $4) on conflict (id) do nothing', [seller.id, seller.name, EMAIL, hash])
}
await db.end()

const call = async (path: string, init: RequestInit) => {
  const r = await fetch(API + path, init)
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}
for (const { seller, body } of LISTINGS) {
  const as = { authorization: `Bearer ${PAYCALL_SERVICE_KEY}`, 'x-paycall-as': `seller:${seller.id}`, 'content-type': 'application/json' }
  const prev = ((await call('/endpoints', { headers: as })) as { id: string; name: string }[]).find((e) => e.name === body.name)
  const ep = (await (prev
    ? call(`/endpoints/${prev.id}`, { method: 'PATCH', headers: as, body: JSON.stringify(body) })
    : call('/endpoints', { method: 'POST', headers: as, body: JSON.stringify(body) }))) as { id: string }
  await call(`/admin/endpoints/${ep.id}/verified`, { method: 'POST', headers: { authorization: `Bearer ${ADMIN_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ verified: true }) })
  console.log(`${prev ? 'updated' : 'created'} ${body.name}: ${API}/p/${ep.id}`)
}

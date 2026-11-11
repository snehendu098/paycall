// one-off: move the seeded listings (Channel3, PayCall Labs) under a dashboard user's own seller account.
// past earnings/ledger stay on the old sellers; new calls pay the target seller (new channel per agent).
// usage: bun --env-file=.env scripts/move-listings.ts <login email>
import pg from 'pg'

const FROM = ['sel_channel3', 'sel_paycall']
const email = process.argv[2]
if (!process.env.DATABASE_URL || !email) throw new Error('usage: DATABASE_URL=… bun scripts/move-listings.ts <login email>')

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  const { rows: [u] } = await db.query('select "sellerId" from "user" where email = $1', [email])
  if (!u?.sellerId) throw new Error(`${email}: no seller account (enable selling on Earn first)`)
  const { rows: [s] } = await db.query('select id, name, paypal_email from sellers where id = $1', [u.sellerId])
  await db.query('begin')
  const { rows } = await db.query('update endpoints set seller_id = $1 where seller_id = any($2) returning id, name', [s.id, FROM])
  await db.query('commit')
  console.log(`moved ${rows.length} to ${s.id} (${s.name}, payouts → ${s.paypal_email}):`)
  for (const r of rows) console.log(`  ${r.id} ${r.name}`)
} catch (e) {
  await db.query('rollback').catch(() => {})
  throw e
} finally {
  await db.end()
}

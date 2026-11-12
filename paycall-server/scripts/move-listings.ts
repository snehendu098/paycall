// one-off: move seeded listings (Channel3, PayCall Labs) under dashboard user's seller account
// past earnings/ledger stay on old sellers; new calls pay target seller (new channel per agent)
// usage: bun --env-file=.env scripts/move-listings.ts <login email>
import pg from 'pg'

const FROM = ['sel_channel3', 'sel_paycall']
const email = process.argv[2]
if (!process.env.DATABASE_URL || !email) throw new Error('usage: DATABASE_URL=… bun scripts/move-listings.ts <login email>')

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  const { rows: [s] } = await db.query('select s.id, s.name, s.paypal_email from "user" u join sellers s on s.id = u."sellerId" where u.email = $1', [email])
  if (!s) throw new Error(`${email}: no seller account (enable selling on Earn first)`)
  const { rows } = await db.query('update endpoints set seller_id = $1 where seller_id = any($2) returning id, name', [s.id, FROM])
  console.log(`moved ${rows.length} to ${s.id} (${s.name}, payouts → ${s.paypal_email}):`)
  for (const r of rows) console.log(`  ${r.id} ${r.name}`)
} finally {
  await db.end()
}

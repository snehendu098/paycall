# paycall-server

PayCall facilitator: x402 v2 pay-per-call for AI agents, settled on PayPal.
Agents prepay via PayPal (vaulted wallet + auto-reload), sign cumulative Ed25519 vouchers per call, sellers get paid in batched PayPal Payouts.

Hono · Cloudflare Workers · Drizzle · Postgres (Hyperdrive) · KV.

## Local dev

```sh
bun install
docker run -d --name paycall-pg -e POSTGRES_USER=paycall -e POSTGRES_PASSWORD=paycall -e POSTGRES_DB=paycall -p 5433:5432 postgres:17-alpine
echo 'DATABASE_URL=postgres://paycall:paycall@localhost:5433/paycall' > .env
cp .dev.vars.example .dev.vars   # fill PayPal sandbox creds
bunx drizzle-kit migrate
bunx wrangler dev
bun test
```

## Deploy

```sh
bunx wrangler login
bunx wrangler kv namespace create KV                     # id → wrangler.jsonc
bunx wrangler hyperdrive create paycall --connection-string="<neon direct url>" --caching-disabled   # id → wrangler.jsonc
DATABASE_URL="<neon direct url>" bunx drizzle-kit migrate
bunx wrangler secret put PAYPAL_CLIENT_ID      # + PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, ADMIN_KEY
bunx wrangler deploy
```

PayPal sandbox app: Merchant type, Vault enabled, webhook → `https://<worker>/webhooks/paypal` with
`PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.PAYOUTS-ITEM.*`.

## API

| Route | Auth | |
|---|---|---|
| `GET /supported` | — | x402 kinds |
| `POST /verify` · `POST /settle` | seller | x402 facilitator |
| `POST /owners` · `POST /sellers` | — | signup → api key (shown once) |
| `GET/PATCH /owners/me` | owner | balance, agents, reload + cap settings |
| `POST /agents` · `PATCH /agents/:pubkey` | owner | register pubkey, pause, max price |
| `GET /sellers/me` | seller | earned, owed, payouts |
| `GET /entries` | owner/seller | ledger |
| `GET /events?key=` | owner/seller | SSE live ledger |
| `POST /topup/create` · `/topup/capture` | owner | PayPal top-up (vaults wallet first time) |
| `POST /webhooks/paypal` | PayPal sig | capture + payout events |
| `POST /admin/settle-now` | admin | run payouts now (cron runs every 10 min) |

Money = integer micros (1,000,000 = $1).

## Scheme `paycall-prepaid` / network `paypal:sandbox`

Voucher (`paymentPayload.payload`), Ed25519 over JSON with fixed key order:

```json
{"channelId":"uuid","payer":"<pubkey b64url>","payTo":"sel_…","cumulativeAmount":"20000","currency":"USD","seq":2,"expiry":1767225600,"sig":"…"}
```

Each voucher = running total for agent↔seller channel: `seq` +1, `cumulativeAmount` += price. Replays and stale vouchers rejected by DB constraints.

# PayCall

Pay-per-call for AI agents, settled on PayPal.

Agents pay for APIs with [x402](https://x402.org) (HTTP 402) from a prepaid PayPal balance. Sellers get paid out to their PayPal account. No crypto and no card on every call: each call is one signed Ed25519 voucher.

- Dashboard: https://paycall.live
- API / facilitator: https://api.paycall.live
- Hosted MCP: `claude mcp add --transport http paycall https://api.paycall.live/mcp`, then `/mcp` → paycall → Authenticate

## How it works

```
agent ──GET──▶ /p/<endpoint> ──402 PAYMENT-REQUIRED──▶ agent
agent ──GET + PAYMENT-SIGNATURE (voucher)──▶ PayCall ──verify──▶ upstream API
                                              │◀──────response──┘
                                         settle (ledger), refund unused, sign receipt
agent ◀── 200 + PAYMENT-RESPONSE ─────────────┘
```

- **Buyers (owners)** top up with PayPal: the wallet is vaulted, with optional auto-reload. They set daily caps and a max price per agent, and can pause any agent.
- **Agents** hold an Ed25519 key. Each call signs a cumulative voucher (`seq`, `cumulativeAmount`) on a buyer→seller channel. This is x402 v2, scheme `paycall-prepaid`, network `paypal:sandbox`.
- **Sellers** either list any HTTPS API behind the PayCall proxy or gate their own server with `paycall-middleware`. Payouts go out through PayPal Payouts every 10 minutes once $0.50 is owed (2% fee).

## Pricing and payment features

| | |
|---|---|
| Per call | Fixed price, e.g. `$0.005/call` |
| Metered | `token` or `char`. The agent signs a cap; PayCall counts the units, charges `units × rate` and refunds the rest. Upstream usage (`output_tokens` / `completion_tokens`) is used when reported. |
| Streaming | SSE passes straight through and is counted as it flows. The stream is cut at the cap and ends with an `event: paycall-receipt` event. If the client disconnects, only what was streamed is charged. |
| Time pass | One payment buys N seconds of free calls. Afterwards the agent proves identity with a signed `PAYCALL-AGENT` header: single-use nonce, 5 min window, bound to method and URL. |
| Dynamic pricing | Middleware takes `price: (req) => '0.05'`, plus `metered: true`. The handler sets `x-paycall-charge` and the rest is refunded. |
| Signed receipts | Compact JWS (EdDSA) in `PAYMENT-RESPONSE.receipt`. Verify it against `/.well-known/jwks.json` with `verifyReceipt()` in the SDK. |
| Refunds and disputes | Sellers can refund any charge. Buyers can dispute a charge within 7 days; open disputes are held back from payouts until the seller refunds or rejects. |
| Idempotency | Re-sending the same voucher returns the original settlement instead of charging twice. The proxy replays the cached response (1 h, ≤ 512 KB). |
| Verified listings | Listings checked by an admin get a verified mark in the catalog and in MCP. |

## Repo

| Folder | What |
|---|---|
| [`paycall-server`](paycall-server) | Facilitator, proxy, ledger, payouts, hosted MCP (OAuth). Hono on Cloudflare Workers, Drizzle, Neon Postgres via Hyperdrive, KV. |
| [`client`](client) | Dashboard: Spend, Earn, Catalog. Next.js 16, Better Auth (email OTP), PayPal JS SDK. |
| [`paycall-sdk`](paycall-sdk) | Agent client. `agent.fetch` is a drop-in `fetch` that pays 402s; also has `verifyReceipt`. |
| [`paycall-mcp`](paycall-mcp) | Local stdio MCP server (`paid_fetch`, `login`, `wallet_info`) for self-run agents. |
| [`paycall-middleware`](paycall-middleware) | Seller middleware for web-standard handlers, Hono and Express. |
| [`e2e`](e2e) | Playwright and end-to-end scripts. |

## Try it

**As a buyer:** sign in at paycall.live → Spend → top up with a PayPal sandbox account. Then add the hosted MCP and ask Claude:

> paid_fetch https://api.paycall.live/p/ep_eJptj7Zcr33BGpYV/story

That is a demo LLM stream billed per character, capped at $0.01. The reply shows the characters charged, the part of the cap refunded, and the signed receipt.

**As a seller:**
- Earn → New endpoint: give an upstream URL, a pricing mode and optional auth headers (stored encrypted). You get a paid URL `https://api.paycall.live/p/<id>`.
- Or self-host:

```ts
import { withPaycall } from 'paycall-middleware'
export const GET = withPaycall(handler, { apiKey: process.env.PAYCALL_KEY!, price: '0.01' })
```

## Local dev

```sh
cd paycall-server && bun install
docker run -d --name paycall-pg -e POSTGRES_USER=paycall -e POSTGRES_PASSWORD=paycall -e POSTGRES_DB=paycall -p 5433:5432 postgres:17-alpine
bunx drizzle-kit migrate && bunx wrangler dev
DATABASE_URL=postgres://paycall:paycall@localhost:5433/paycall bun test

cd ../client && bun install && bun dev
```

Details for each package are in its own README. Money is stored as integer micros (1,000,000 = $1).

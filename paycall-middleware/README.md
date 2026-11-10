# paycall-middleware

Charge per request on your own API with PayCall (x402 `paycall-prepaid`), no PayCall proxy needed. Unpaid request gets a `402` + `PAYMENT-REQUIRED`. Paid request: voucher verified, your handler runs, buyer charged only if it returns 2xx, `PAYMENT-RESPONSE` set on the reply.

## Install

```sh
bun add ../paycall-middleware   # npm later
```

API key: PayCall dashboard → Earn → API key (`pc_seller_…`).

```ts
const opts = { apiKey: process.env.PAYCALL_KEY!, price: '0.01' } // dollars. facilitator? defaults to hosted PayCall
```

## Next.js route handler

```ts
import { withPaycall } from 'paycall-middleware'
export const GET = withPaycall(async () => Response.json({ joke: '...' }), opts)
```

## Bun.serve (also Workers, Deno: any `(Request) => Response`)

```ts
import { withPaycall } from 'paycall-middleware'
Bun.serve({ fetch: withPaycall((req) => Response.json({ ok: true }), opts) })
```

## Hono

```ts
import { paycallHono } from 'paycall-middleware'
app.use('/paid/*', paycallHono(opts))
app.get('/paid/joke', (c) => c.json({ joke: '...' }))
```

## Express

```ts
import { paycallExpress } from 'paycall-middleware'
app.use('/paid', paycallExpress(opts))
app.get('/paid/joke', (req, res) => res.json({ joke: '...' }))
```

## Other frameworks

`paycall(opts)` returns `gate(url, paymentSignatureHeader)` → either a `402` `Response` to send, or `settle()` to call after your handler succeeds.

## How buyers pay

- Claude: PayCall MCP, just ask it to call your URL.
- Code: `paycall-sdk`, `(await createAgent(privateKey)).fetch(url)` handles 402 → sign → retry.

## Rules / notes

- Handler non-2xx → no charge, response passed through.
- Settle fails (e.g. buyer ran out of funds mid-request) → `402`, your body withheld.
- Express: settle runs when your handler calls `res.end` (`res.send`/`res.json`), so the body can still be swapped for a 402. If you stream (`res.write` first), headers are already out: a settle failure is only logged, you're not paid, buyer not charged.

## Check

```sh
bun scripts/demo.ts   # needs local paycall-server (wrangler dev --port 8798) + paycall-pg
```

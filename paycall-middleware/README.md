# @paycall-live/middleware

Charge per request on your own API with PayCall (x402 `paycall-prepaid`), no PayCall proxy needed. Unpaid request gets a `402` + `PAYMENT-REQUIRED`. Paid request: voucher verified, your handler runs, buyer charged only if it returns 2xx, `PAYMENT-RESPONSE` set on the reply.

## Install

```sh
npm i @paycall-live/middleware   # or bun add / pnpm add
```

API key: PayCall dashboard → Earn → API key (`pc_seller_…`).

```ts
const opts = { apiKey: process.env.PAYCALL_KEY!, price: '0.01' } // dollars. facilitator? defaults to hosted PayCall
```

## Next.js route handler

```ts
import { withPaycall } from '@paycall-live/middleware'
export const GET = withPaycall(async () => Response.json({ joke: '...' }), opts)
```

## Bun.serve (also Workers, Deno: any `(Request) => Response`)

```ts
import { withPaycall } from '@paycall-live/middleware'
Bun.serve({ fetch: withPaycall((req) => Response.json({ ok: true }), opts) })
```

## Hono

```ts
import { paycallHono } from '@paycall-live/middleware'
app.use('/paid/*', paycallHono(opts))
app.get('/paid/joke', (c) => c.json({ joke: '...' }))
```

## Express

```ts
import { paycallExpress } from '@paycall-live/middleware'
app.use('/paid', paycallExpress(opts))
app.get('/paid/joke', (req, res) => res.json({ joke: '...' }))
```

## Other frameworks

`paycall(opts)` returns `gate(url, paymentSignatureHeader)` → either a `402` `Response` to send, or `settle()` to call after your handler succeeds.

## How buyers pay

- Claude: PayCall MCP, just ask it to call your URL.
- Code: `@paycall-live/sdk`, `(await createAgent(privateKey)).fetch(url)` handles 402 → sign → retry.

## Rules / notes

- Handler non-2xx → no charge, response passed through.
- Settle fails (e.g. buyer ran out of funds mid-request) → `402`, your body withheld.
- Express: settle runs when your handler calls `res.end` (`res.send`/`res.json`), so the body can still be swapped for a 402. If you stream (`res.write` first), headers are already out: a settle failure is only logged, you're not paid, buyer not charged.

## Check

```sh
bun scripts/demo.ts   # needs local paycall-server (wrangler dev --port 8798) + paycall-pg
```

## Dynamic pricing

`price` can be a function of the request (sync or async):

```ts
withPaycall(handler, { ...opts, price: (req) => (new URL(req.url).searchParams.get('size') === 'hd' ? '0.05' : '0.01') })
```

## Metered (pay for what you use)

With `metered: true`, `price` is the **cap** the agent signs. Your handler reports actual use in `x-paycall-charge` (dollars). PayCall keeps that and refunds the rest to the buyer right away. The header is stripped before the reply goes out.

```ts
withPaycall(async (req) => {
  const out = await runModel(req)
  return Response.json(out, { headers: { 'x-paycall-charge': String(out.usage.output_tokens * 0.00001) } })
}, { ...opts, metered: true, price: '0.05' })
```

The PayCall proxy does this automatically for `token` / `char` endpoints, including SSE streams (counted as they flow, cut at the cap, signed receipt in a final `event: paycall-receipt`).

## Receipts, refunds, disputes

- `PAYMENT-RESPONSE` carries `receipt`: an EdDSA JWS. Verify with `verifyReceipt(jws)` from `@paycall-live/sdk` (keys at `{facilitator}/.well-known/jwks.json`).
- Refund a charge: `POST {facilitator}/entries/<transaction>/refund` with your seller key, body `{ "amount": micros }` (omit = everything left).
- Buyers can dispute a charge for 7 days; open disputes are held out of your payout until you refund or reject them (Earn → Disputes).

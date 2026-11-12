// docs content as typed data. one page = intro + h2 sections; sidebar, toc, search derive from this
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Code } from '@/components/ds'
import { cn } from '@/lib/utils'

export type Section = { id: string; title: string; body: ReactNode }
export type Doc = { slug: string; title: string; description: string; intro?: ReactNode; sections: Section[] }
export type Group = { title: string; pages: Doc[] }

const API = 'https://api.paycall.live'
const STORY = `${API}/p/ep_eJptj7Zcr33BGpYV/story`

// ---------- prose ----------

const P = ({ children }: { children: ReactNode }) => <p className="text-[15px] leading-7 text-foreground/80">{children}</p>
const C = ({ children }: { children: ReactNode }) => (
  <code className="break-words box-decoration-clone border border-border bg-card px-1 py-px font-mono text-[0.84em] text-foreground">{children}</code>
)
const A = ({ href, children }: { href: string; children: ReactNode }) => {
  const cls = 'text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground'
  return href.startsWith('/') ? <Link href={href} className={cls}>{children}</Link> : <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>
}
const Ul = ({ items, ordered }: { items: ReactNode[]; ordered?: boolean }) => {
  const L = ordered ? 'ol' : 'ul'
  return (
    <L className="flex flex-col gap-2 text-[15px] leading-7 text-foreground/80">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className={cn('shrink-0 font-mono text-xs leading-7 text-muted-foreground', !ordered && 'pt-[11px] leading-none')}>
            {ordered ? String(i + 1).padStart(2, '0') : <span className="block size-1.5 bg-muted-foreground/70" />}
          </span>
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </L>
  )
}
const Pre = ({ children, title }: { children: string; title?: string }) => (
  <div className="flex min-w-0 flex-col">
    {title && <div className="border border-b-0 border-border px-4 py-2 font-mono text-[11px] text-muted-foreground">{title}</div>}
    <Code text={children.trim()} />
  </div>
)
const Note = ({ children, tone = 'note' }: { children: ReactNode; tone?: 'note' | 'warn' }) => (
  <div className={cn('border-l-2 bg-card px-4 py-3 text-sm leading-6 text-foreground/80', tone === 'warn' ? 'border-destructive/70' : 'border-live/70')}>{children}</div>
)
const th = 'font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground'
// server-rendered: table on sm+, stacked label/value cards on phones
const Tbl = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="min-w-0 border border-border bg-card text-sm leading-6">
    <table className="w-full border-collapse max-sm:hidden">
      <thead>
        <tr className="border-b border-border">
          {head.map((h) => <th key={h} className={cn(th, 'h-9 px-3 text-left')}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border last:border-b-0">
            {r.map((c, j) => <td key={j} className={cn('px-3 py-2.5 align-top', j === 0 ? 'text-foreground' : 'text-foreground/80')}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
    <ul className="divide-y divide-border sm:hidden">
      {rows.map((r, i) => (
        <li key={i} className="flex flex-col gap-1.5 px-4 py-3">
          <div className="text-foreground">{r[0]}</div>
          {r.slice(1).map((c, j) => (
            <div key={j} className="text-foreground/80">
              <span className={cn(th, 'mr-2')}>{head[j + 1]}</span>
              {c}
            </div>
          ))}
        </li>
      ))}
    </ul>
  </div>
)

/** Sequence diagram as rows: who → whom, what. */
const Flow = ({ steps }: { steps: [string, string, ReactNode][] }) => (
  <ol className="border border-border bg-card font-mono text-[12px]">
    {steps.map(([from, to, what], i) => (
      <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[2rem_11rem_minmax(0,1fr)]">
        <span className="text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
        <span className="text-foreground">
          {from} <span className="text-live">→</span> {to}
        </span>
        <span className="col-start-2 text-muted-foreground sm:col-start-3">{what}</span>
      </li>
    ))}
  </ol>
)

// ---------- pages ----------

export const groups: Group[] = [
  {
    title: 'Getting started',
    pages: [
      {
        slug: '',
        title: 'Introduction',
        description: 'Pay-per-call for AI agents, settled on PayPal. Built on x402 (HTTP 402).',
        intro: (
          <>
            <P>
              PayCall lets AI agents pay for APIs per call from a prepaid PayPal balance, and pays sellers out to their PayPal account. There is no crypto and no card
              charge on every call: each paid request carries one signed Ed25519 voucher.
            </P>
            <P>
              It speaks <A href="https://x402.org">x402</A> v2: an unpaid request gets <C>402 Payment Required</C> with a <C>PAYMENT-REQUIRED</C> header, the agent retries
              with a <C>PAYMENT-SIGNATURE</C> header, and the response carries <C>PAYMENT-RESPONSE</C>. Scheme <C>paycall-prepaid</C>, network <C>paypal:sandbox</C>.
            </P>
          </>
        ),
        sections: [
          {
            id: 'roles',
            title: 'Who does what',
            body: (
              <Ul
                items={[
                  <><b className="font-normal text-foreground">Buyers (owners)</b> top up with PayPal. The wallet is vaulted with optional auto-reload. They set daily caps and a max price per agent, and can pause any agent.</>,
                  <><b className="font-normal text-foreground">Agents</b> hold an Ed25519 key. Each call signs a cumulative voucher on a buyer→seller channel. Use the hosted MCP server in Claude, the local MCP server, or the SDK.</>,
                  <><b className="font-normal text-foreground">Sellers</b> list any HTTPS API behind the PayCall proxy, or gate their own server with the middleware. Payouts go out every 10 minutes once $0.50 is owed (2% fee).</>,
                ]}
              />
            ),
          },
          {
            id: 'features',
            title: 'Features',
            body: (
              <Tbl
                head={['Feature', 'What it does']}
                rows={[
                  [<A key="a" href="/docs/pricing#per-call">Per call</A>, 'Fixed price, e.g. $0.005 per call.'],
                  [<A key="a" href="/docs/pricing#metered">Metered</A>, 'Per token or per char. The agent signs a cap; PayCall counts units, charges units × rate and refunds the rest.'],
                  [<A key="a" href="/docs/pricing#streaming">Streaming</A>, 'SSE is counted as it flows, cut at the cap, and ends with an event: paycall-receipt event.'],
                  [<A key="a" href="/docs/pricing#time-pass">Time pass</A>, 'One payment buys N seconds of free calls, proven with a signed PAYCALL-AGENT header.'],
                  [<A key="a" href="/docs/pricing#dynamic">Dynamic pricing</A>, 'Middleware price can be a function of the request.'],
                  [<A key="a" href="/docs/receipts">Signed receipts</A>, 'EdDSA JWS per charge, verifiable against /.well-known/jwks.json.'],
                  [<A key="a" href="/docs/disputes">Refunds and disputes</A>, 'Seller refunds, buyer disputes within 7 days, escalation to PayCall.'],
                  [<A key="a" href="/docs/idempotency">Idempotency</A>, 'Re-sending a voucher returns the original settlement, never a second charge.'],
                  [<A key="a" href="/docs/buyer-controls">Buyer controls</A>, 'Daily caps, max price, approvals above a threshold, seller allowlists, pause.'],
                ]}
              />
            ),
          },
          {
            id: 'live',
            title: 'Live endpoints',
            body: (
              <Tbl
                head={['What', 'URL']}
                rows={[
                  ['Dashboard', <A key="a" href="https://paycall.live">https://paycall.live</A>],
                  ['API and facilitator', <C key="c">{API}</C>],
                  ['Hosted MCP', <C key="c">{API}/mcp</C>],
                  ['Receipt keys (JWKS)', <C key="c">{API}/.well-known/jwks.json</C>],
                  ['Catalog', <C key="c">{API}/catalog?q=</C>],
                ]}
              />
            ),
          },
          {
            id: 'packages',
            title: 'Packages',
            body: (
              <>
                <Tbl
                  head={['Package', 'Use it for']}
                  rows={[
                    [<C key="c">@paycall-live/sdk</C>, <>Agent client. <C>agent.fetch</C> is a drop-in <C>fetch</C> that pays 402s. Also <C>verifyReceipt</C>. <A href="/docs/guides/sdk">Guide</A></>],
                    [<C key="c">@paycall-live/middleware</C>, <>Charge on your own server: web-standard handlers, Hono, Express. <A href="/docs/guides/middleware">Guide</A></>],
                    [<C key="c">@paycall-live/mcp</C>, <>Local stdio MCP server for self-run agents. <A href="/docs/guides/local-mcp">Guide</A></>],
                  ]}
                />
                <P>
                  Money is always integer micros on the wire: <C>1000000</C> = $1. The middleware <C>price</C> option is the only place you write dollars.
                </P>
              </>
            ),
          },
        ],
      },
      {
        slug: 'quickstart',
        title: 'Quickstart',
        description: 'Fund a wallet, let Claude pay for a call, and list your own paid API.',
        sections: [
          {
            id: 'buyer',
            title: 'Fund a wallet',
            body: (
              <>
                <Ul
                  ordered
                  items={[
                    <>Sign in at <A href="https://paycall.live">paycall.live</A> with your email (one-time code).</>,
                    <>Open <b className="font-normal text-foreground">Spend</b> and top up with a PayPal sandbox account ($1 to $500). Your first top-up vaults the wallet so auto-reload can work.</>,
                    <>Optional: <b className="font-normal text-foreground">Auto-reload &amp; limits</b> sets the reload threshold and amount, and your daily cap.</>,
                  ]}
                />
                <Note tone="warn">Use a US PayPal sandbox account. Other sandbox countries can fail (for example, INR is not supported for these flows).</Note>
              </>
            ),
          },
          {
            id: 'claude',
            title: 'Let Claude pay',
            body: (
              <>
                <P>Add the hosted MCP server to Claude Code:</P>
                <Pre>{`claude mcp add --transport http paycall ${API}/mcp`}</Pre>
                <P>
                  In Claude Code run <C>/mcp</C> → <C>paycall</C> → <b className="font-normal text-foreground">Authenticate</b>. Your browser opens; approve the agent. Then ask:
                </P>
                <Pre>{`paid_fetch ${STORY}`}</Pre>
                <P>
                  That is a demo LLM stream billed per character, capped at $0.01. The reply shows the characters charged, the part of the cap refunded, and the signed receipt.
                  Ask Claude to <C>search_paid_apis</C> for more, for example Channel3 product search at $0.005 per call.
                </P>
              </>
            ),
          },
          {
            id: 'seller',
            title: 'Sell an API',
            body: (
              <>
                <P>
                  No code: in the dashboard open <b className="font-normal text-foreground">Earn → New endpoint</b>, give an HTTPS upstream URL, a pricing mode and optional auth
                  headers (stored encrypted). You get a paid URL <C>{API}/p/&lt;id&gt;</C>. See <A href="/docs/guides/list-an-api">Listing an API</A>.
                </P>
                <P>Or gate your own server. Get a seller key in Earn → API key, then:</P>
                <Pre title="app/api/joke/route.ts">{`
import { withPaycall } from '@paycall-live/middleware'

export const GET = withPaycall(async () => Response.json({ joke: '...' }), {
  apiKey: process.env.PAYCALL_KEY!, // pc_seller_…
  price: '0.01', // dollars
})`}</Pre>
                <P>
                  Earnings pay out to your PayPal email every 10 minutes once you are owed $0.50. See <A href="/docs/how-it-works#payouts">Payouts</A>.
                </P>
              </>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Concepts',
    pages: [
      {
        slug: 'how-it-works',
        title: 'How it works',
        description: 'The x402 flow, vouchers and channels, settlement and payouts.',
        sections: [
          {
            id: 'flow',
            title: 'The x402 flow',
            body: (
              <>
                <Flow
                  steps={[
                    ['Agent', 'Seller', <>GET <C>/p/&lt;endpoint&gt;</C> with no payment</>],
                    ['Seller', 'Agent', <>402 with <C>PAYMENT-REQUIRED</C>: price, payTo, facilitator</>],
                    ['Agent', 'Facilitator', <>GET <C>/channels/&lt;pubkey&gt;/&lt;seller&gt;</C> for the current seq and total</>],
                    ['Agent', 'Seller', <>Same request + <C>PAYMENT-SIGNATURE</C> (signed voucher)</>],
                    ['Seller', 'Facilitator', <><C>/verify</C>: signature, limits, balance</>],
                    ['Seller', 'Upstream', 'Run the request. Non-2xx means no charge.'],
                    ['Seller', 'Facilitator', <><C>/settle</C>: debit buyer, advance channel, refund unused cap</>],
                    ['Seller', 'Agent', <>200 + <C>PAYMENT-RESPONSE</C> with transaction and signed receipt</>],
                  ]}
                />
                <P>
                  With the PayCall proxy, &quot;Seller&quot; and &quot;Facilitator&quot; are the same server. With the middleware, your server calls <C>{API}/verify</C> and{' '}
                  <C>/settle</C> with your seller key. The SDK and both MCP servers do steps 3 and 4 for you.
                </P>
              </>
            ),
          },
          {
            id: 'vouchers',
            title: 'Vouchers and channels',
            body: (
              <>
                <P>
                  Every agent-to-seller pair has one channel. A voucher is cumulative: it says &quot;the total I have paid on this channel is now X, and this is call number
                  seq&quot;. Each call raises <C>seq</C> by exactly 1 and <C>cumulativeAmount</C> by exactly the price.
                </P>
                <Pre title="voucher (signed fields, in this order)">{`
{
  "channelId": "6f1c…",          // uuid, made by the agent on first call
  "payer": "<agent pubkey>",       // raw Ed25519 public key, base64url (43 chars)
  "payTo": "sel_…",                // seller id from PAYMENT-REQUIRED
  "cumulativeAmount": "15000",     // micros, previous total + this price
  "currency": "USD",
  "seq": 3,                        // previous seq + 1
  "expiry": 1767225600             // unix seconds, SDK uses now + 300
}`}</Pre>
                <P>
                  The signature is Ed25519 over <C>JSON.stringify(voucher, fieldOrder)</C> with exactly that field order, base64url-encoded into <C>sig</C>. A voucher that
                  does not continue the channel fails with <C>stale_voucher</C>; the SDK then refetches the channel and retries once.
                </P>
                <P>
                  The SDK serializes calls per seller because <C>seq</C> is strict. Calls to different sellers run in parallel.
                </P>
              </>
            ),
          },
          {
            id: 'settlement',
            title: 'Settlement',
            body: (
              <>
                <P>
                  Settle runs in one database transaction: insert the charge (unique per voucher), debit the buyer only if the balance covers it, and move the channel from{' '}
                  <C>seq - 1</C> to <C>seq</C>. If any step fails, nothing is written. A balance can never go negative.
                </P>
                <P>
                  Metered calls settle the signed cap first, then refund the unused part as soon as the units are counted. After a settle drops the balance below the
                  reload threshold, PayCall charges the vaulted PayPal wallet in the background.
                </P>
                <Note>
                  Daily caps are checked just before the transaction, so parallel calls can overshoot a cap by one call. The balance check is inside the transaction and
                  cannot overshoot.
                </Note>
              </>
            ),
          },
          {
            id: 'payouts',
            title: 'Payouts',
            body: (
              <>
                <Ul
                  items={[
                    <>A cron runs every 10 minutes and sends one PayPal Payouts batch to every seller owed at least <b className="font-normal text-foreground">$0.50</b>.</>,
                    <>Owed = everything charged on your channels − refunds − amounts held by open disputes − already paid or in flight.</>,
                    <>PayCall keeps a <b className="font-normal text-foreground">2%</b> fee. Amounts are floored to whole cents; the sub-cent rest waits for the next run.</>,
                    <>Disputes the seller ignored for 3 days are auto-refunded just before payouts run, so they come out of what is owed.</>,
                  ]}
                />
              </>
            ),
          },
        ],
      },
      {
        slug: 'pricing',
        title: 'Pricing modes',
        description: 'Per call, metered by token or char, streaming SSE, time passes and dynamic prices.',
        sections: [
          {
            id: 'per-call',
            title: 'Per call',
            body: (
              <P>
                A fixed price, set in micros on a listing or in dollars in the middleware. <C>PAYMENT-REQUIRED.accepts[0].amount</C> is the price and the agent signs exactly that.
              </P>
            ),
          },
          {
            id: 'metered',
            title: 'Metered (token or char)',
            body: (
              <>
                <P>
                  The listing has a <C>rate</C> per unit and a <C>max</C> per call. The agent signs the cap. PayCall counts units in the response, charges{' '}
                  <C>min(units × rate, max)</C> and refunds the rest right away.
                </P>
                <Ul
                  items={[
                    <><C>char</C>: characters in the body (for SSE, the text inside each event).</>,
                    <><C>token</C>: <C>usage.output_tokens</C> or <C>usage.completion_tokens</C> when upstream reports it (Anthropic and OpenAI shapes), otherwise about 4 chars per token.</>,
                  ]}
                />
                <Pre title="PAYMENT-REQUIRED accepts[0] (metered)">{`
{
  "scheme": "paycall-prepaid",
  "network": "paypal:sandbox",
  "amount": "10000",               // the cap the agent signs
  "asset": "USD",
  "payTo": "sel_…",
  "maxTimeoutSeconds": 60,
  "extra": {
    "facilitator": "${API}",
    "pricing": { "unit": "char", "rate": "20", "max": "10000" }
  }
}`}</Pre>
                <P>
                  The final <C>PAYMENT-RESPONSE</C> carries <C>units</C>, <C>unit</C>, <C>refunded</C> and the actual <C>amount</C>.
                </P>
              </>
            ),
          },
          {
            id: 'streaming',
            title: 'Streaming (SSE)',
            body: (
              <>
                <P>
                  When a metered upstream answers <C>text/event-stream</C>, PayCall passes the stream through and counts as it flows. The response header only has the cap
                  (<C>metered: true</C>). The stream is cut once the cap is reached, and always ends with a receipt event:
                </P>
                <Pre>{`
data: {"delta":{"text":"An "}}
data: {"delta":{"text":"agent "}}
…
event: paycall-receipt
data: {"success":true,"transaction":"812","amount":"6420","units":321,"unit":"char","cut":false,"refunded":"3580","receipt":"eyJ…"}`}</Pre>
                <P>
                  If the client disconnects, only what was streamed is charged. Try the demo: <C>{STORY}?words=10</C> ($0.00002 per char, cap $0.01). The SDK&apos;s{' '}
                  <C>describeResponse</C> reads the trailer for you.
                </P>
              </>
            ),
          },
          {
            id: 'time-pass',
            title: 'Time pass',
            body: (
              <>
                <P>
                  One payment buys N seconds of free calls to one endpoint (e.g. Channel3 1h pass, $0.10). <C>extra.pass.seconds</C> in <C>PAYMENT-REQUIRED</C> marks it. Buying
                  again while a pass is active extends it.
                </P>
                <P>While the pass is valid, the agent proves who it is with a signed header instead of paying:</P>
                <Pre>{`
PAYCALL-AGENT: <pubkey>.<unix ts>.<nonce>.<sig>
sig = Ed25519("paycall-agent:<ts>:<nonce>:<METHOD>:<full url>")`}</Pre>
                <Ul
                  items={[
                    'The timestamp must be within 5 minutes of server time.',
                    'The nonce is single-use: a replayed header falls through to a normal 402.',
                    'It is bound to the method and the exact URL.',
                    <>The response has <C>PAYMENT-RESPONSE</C> with <C>pass.expiresAt</C> and no transaction.</>,
                  ]}
                />
                <P>The SDK sends this header automatically to origins that sell passes, so held passes ride free.</P>
              </>
            ),
          },
          {
            id: 'dynamic',
            title: 'Dynamic pricing',
            body: (
              <>
                <P>In the middleware, <C>price</C> can be a function of the request, sync or async:</P>
                <Pre>{`
withPaycall(handler, {
  ...opts,
  price: (req) => (new URL(req.url).searchParams.get('size') === 'hd' ? '0.05' : '0.01'),
})`}</Pre>
                <P>
                  Combine with <C>metered: true</C> to make <C>price</C> the cap and report actual use from your handler in <C>x-paycall-charge</C>. See{' '}
                  <A href="/docs/guides/middleware#metered">Metered middleware</A>.
                </P>
              </>
            ),
          },
        ],
      },
      {
        slug: 'receipts',
        title: 'Signed receipts',
        description: 'Every charge comes with an EdDSA JWS you can verify offline against the JWKS.',
        sections: [
          {
            id: 'format',
            title: 'Format',
            body: (
              <>
                <P>
                  Proxy responses put a compact JWS in <C>PAYMENT-RESPONSE.receipt</C> (for streams, in the <C>paycall-receipt</C> event). Header{' '}
                  <C>{`{"alg":"EdDSA","typ":"paycall-receipt+jwt","kid":"…"}`}</C>, payload:
                </P>
                <Pre>{`
{
  "iss": "${API}",       // facilitator origin
  "sub": "812",                         // charge id (transaction)
  "payer": "<agent pubkey>",
  "payTo": "sel_…",
  "resource": "${STORY}",
  "amount": "6420",                     // micros actually charged, after unused refund
  "units": 321,                         // metered only
  "pass": "2026-11-12T18:00:00.000Z",   // pass expiry, pass only
  "iat": 1767225600
}`}</Pre>
              </>
            ),
          },
          {
            id: 'verify',
            title: 'Verify',
            body: (
              <>
                <Pre>{`
import { decodePaymentHeader, verifyReceipt } from '@paycall-live/sdk'

const paid = decodePaymentHeader(res.headers.get('payment-response'))
const claims = await verifyReceipt(paid.receipt) // payload if valid, else undefined`}</Pre>
                <P>
                  <C>verifyReceipt</C> fetches <C>{'{iss}'}/.well-known/jwks.json</C> (cached 1 h by the server), picks the key by <C>kid</C>, and checks the Ed25519
                  signature with WebCrypto. Pass <C>{'{ jwksUrl }'}</C> to pin a facilitator or <C>{'{ fetch }'}</C> for a custom transport.
                </P>
                <Note>Self-hosted middleware responses carry the settlement (transaction, amount) but no receipt.</Note>
              </>
            ),
          },
        ],
      },
      {
        slug: 'idempotency',
        title: 'Idempotency and retries',
        description: 'A lost response never costs twice: replays return the original settlement.',
        sections: [
          {
            id: 'settle',
            title: 'Facilitator',
            body: (
              <P>
                Sending the exact last voucher again (same channel, seq and signature) to <C>/settle</C> returns the original transaction instead of charging again. Any other
                voucher that does not continue the channel fails with <C>stale_voucher</C>.
              </P>
            ),
          },
          {
            id: 'proxy',
            title: 'Proxy replay cache',
            body: (
              <>
                <P>
                  The proxy caches each paid response for <b className="font-normal text-foreground">1 hour</b> when the body is at most <b className="font-normal text-foreground">512 KB</b>,
                  keyed by a hash of the <C>PAYMENT-SIGNATURE</C> header. Re-sending the same paid request returns the stored response with <C>paycall-replay: 1</C>, and
                  upstream is not called again.
                </P>
                <P>Streams and responses without a known size up to 512 KB are passed through and not cached.</P>
              </>
            ),
          },
          {
            id: 'client',
            title: 'Client side',
            body: (
              <Ul
                items={[
                  'To retry a call whose response was lost, resend the same PAYMENT-SIGNATURE. Do not sign a new voucher.',
                  'The SDK buffers request bodies once so its own retries resend the same bytes.',
                  'On stale_voucher or channel_mismatch the SDK refetches the channel and signs once more.',
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: 'disputes',
        title: 'Refunds and disputes',
        description: 'Seller refunds, buyer disputes, timeouts, escalation, and how holds affect payouts.',
        sections: [
          {
            id: 'refunds',
            title: 'Refunds',
            body: (
              <>
                <P>A seller can refund any charge, fully or in part, any time. The money goes back to the buyer balance and out of the seller&apos;s earnings.</P>
                <Pre>{`
curl -X POST ${API}/entries/<transaction>/refund \\
  -H "authorization: Bearer $PAYCALL_KEY" \\
  -H "content-type: application/json" \\
  -d '{"amount": 5000}'   # micros; omit to refund everything left`}</Pre>
                <P>
                  Fails with <C>already_refunded</C> or <C>refund_exceeds_charge</C>. Refunds also count against daily caps: caps use net spend.
                </P>
              </>
            ),
          },
          {
            id: 'flow',
            title: 'Dispute flow',
            body: (
              <Flow
                steps={[
                  ['Buyer', 'PayCall', <>Opens a dispute within <b className="font-normal text-foreground">7 days</b> of the charge, with a reason. The amount is held from payouts.</>],
                  ['Seller', 'PayCall', <>Has <b className="font-normal text-foreground">3 days</b> to refund or reject. A rejection needs a reason the buyer sees.</>],
                  ['PayCall', 'Buyer', 'No answer in 3 days: automatic full refund.'],
                  ['Buyer', 'PayCall', <>After a rejection, can escalate <b className="font-normal text-foreground">once</b>, within 3 days. The hold stays.</>],
                  ['PayCall', 'Both', 'An admin refunds or rejects. That decision is final.'],
                ]}
              />
            ),
          },
          {
            id: 'holds',
            title: 'Holds',
            body: (
              <P>
                The disputed amount is held out of the seller&apos;s payout while a dispute is open or escalated, and for 3 days after a seller rejection (the escalation window).
                The amount is whatever was not yet refunded when the dispute opened.
              </P>
            ),
          },
          {
            id: 'api',
            title: 'API',
            body: (
              <Tbl
                head={['Route', 'Who', 'Body']}
                rows={[
                  [<C key="c">POST /entries/:id/dispute</C>, 'buyer', <C key="b">{`{ "reason": "3–500 chars" }`}</C>],
                  [<C key="c">GET /disputes</C>, 'buyer, seller', 'Your last 100 disputes.'],
                  [<C key="c">POST /disputes/:id</C>, 'seller', <C key="b">{`{ "action": "refund" | "reject", "reply"?: "…" }`}</C>],
                  [<C key="c">POST /disputes/:id/escalate</C>, 'buyer', '—'],
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: 'buyer-controls',
        title: 'Buyer controls',
        description: 'Caps, max price, approvals, seller allowlists, pause and auto-reload.',
        sections: [
          {
            id: 'limits',
            title: 'Limits',
            body: (
              <Tbl
                head={['Setting', 'Scope', 'Default', 'Error when hit']}
                rows={[
                  ['Daily cap', 'owner', '$5', <C key="c">daily_cap_exceeded</C>],
                  ['Daily cap', 'agent', 'off', <C key="c">agent_daily_cap_exceeded</C>],
                  ['Max price per call', 'agent', '$1', <C key="c">price_above_agent_limit</C>],
                  ['Approve above', 'agent', 'off', <C key="c">approval_required</C>],
                  ['Allowed sellers', 'agent', 'any', <C key="c">seller_not_allowed</C>],
                  ['Paused', 'agent', 'no', <C key="c">agent_paused</C>],
                ]}
              />
            ),
          },
          {
            id: 'approvals',
            title: 'Approvals',
            body: (
              <P>
                A call priced above an agent&apos;s approval threshold fails with <C>approval_required</C> and shows up in <b className="font-normal text-foreground">Spend → Approvals</b>.
                Approve it, then retry the same call. One approval covers one call at that price to that seller.
              </P>
            ),
          },
          {
            id: 'reload',
            title: 'Auto-reload',
            body: (
              <P>
                After a settle drops the balance below the threshold (default $2), PayCall charges your vaulted PayPal wallet the reload amount (default $10, minimum $1).
                Only one reload runs at a time.
              </P>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Guides',
    pages: [
      {
        slug: 'guides/hosted-mcp',
        title: 'Hosted MCP',
        description: 'Give Claude a PayCall wallet over OAuth. No install, no key on your machine.',
        sections: [
          {
            id: 'setup',
            title: 'Setup',
            body: (
              <>
                <Pre>{`claude mcp add --transport http paycall ${API}/mcp`}</Pre>
                <P>
                  Run <C>/mcp</C> → <C>paycall</C> → <b className="font-normal text-foreground">Authenticate</b>. The dashboard asks you to name the agent and optionally set its
                  max price, then sends you back. Other clients (Claude Desktop, Cursor, VS Code): add the same URL as a remote MCP server.
                </P>
                <P>
                  Each approval creates a new agent with its own key, kept encrypted inside the OAuth grant. The same client on two machines is two agents. Remove an agent in
                  Spend to revoke it.
                </P>
              </>
            ),
          },
          {
            id: 'tools',
            title: 'Tools',
            body: (
              <Tbl
                head={['Tool', 'Input', 'Does']}
                rows={[
                  [<C key="c">paid_fetch</C>, <C key="i">{`{ url, method?, headers?, body? }`}</C>, 'Fetches the URL and pays a paycall-prepaid 402. Returns status, amount paid, metering, receipt and body (cut at 20k chars).'],
                  [<C key="c">search_paid_apis</C>, <C key="i">{`{ query? }`}</C>, 'Searches the catalog: name, seller, price, URL. Verified listings first.'],
                  [<C key="c">wallet_info</C>, <C key="i">{'{}'}</C>, 'Balance, spend today vs daily cap, agent status, auto-reload.'],
                ]}
              />
            ),
          },
          {
            id: 'try',
            title: 'Try it',
            body: (
              <>
                <Pre>{`
search_paid_apis channel3
paid_fetch ${STORY}?words=12`}</Pre>
                <P>If a call fails, the tool returns a plain-language reason and a fix (top up, raise a cap, approve). See <A href="/docs/reference/errors">Error codes</A>.</P>
              </>
            ),
          },
        ],
      },
      {
        slug: 'guides/local-mcp',
        title: 'Local MCP',
        description: 'Run the stdio MCP server with npx for self-run agents and key files.',
        intro: <Note>Most users want the <A href="/docs/guides/hosted-mcp">hosted server</A>. The local one is for offline or self-run agents and SDK key files.</Note>,
        sections: [
          {
            id: 'setup',
            title: 'Setup',
            body: (
              <>
                <Pre>{`claude mcp add paycall -- npx -y @paycall-live/mcp`}</Pre>
                <Pre title="claude_desktop_config.json">{`{ "mcpServers": { "paycall": { "command": "npx", "args": ["-y", "@paycall-live/mcp"] } } }`}</Pre>
                <P>Needs Node 20+. If Claude Desktop cannot find <C>npx</C>, use its absolute path.</P>
              </>
            ),
          },
          {
            id: 'login',
            title: 'Login',
            body: (
              <>
                <P>Ask Claude to &quot;log in to PayCall&quot;, or run:</P>
                <Pre>{`npx -y @paycall-live/mcp login [name]`}</Pre>
                <P>
                  It makes an Ed25519 key on this machine, prints a code and opens the dashboard&apos;s connect page. Enter the code and approve (codes expire in 10 minutes).
                  The key is saved to <C>~/.config/paycall/agent.json</C> (mode 600). Only the public key is ever sent.
                </P>
                <P>Logging in again replaces (pauses) the old key. Your balance stays.</P>
              </>
            ),
          },
          {
            id: 'tools',
            title: 'Tools and env',
            body: (
              <Tbl
                head={['Name', 'What']}
                rows={[
                  [<C key="c">paid_fetch</C>, 'Same as hosted: fetch and pay.'],
                  [<C key="c">login</C>, 'Starts the device login, returns URL + code.'],
                  [<C key="c">wallet_info</C>, 'Login status, agent pubkey, spent this session.'],
                  [<C key="c">PAYCALL_API</C>, 'Facilitator URL (default: hosted).'],
                  [<C key="c">PAYCALL_KEY_FILE</C>, 'Key file path.'],
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: 'guides/sdk',
        title: 'Agent SDK',
        description: 'agent.fetch: a drop-in fetch that pays HTTP 402s from your PayCall balance.',
        sections: [
          {
            id: 'install',
            title: 'Install',
            body: <Pre>{`npm i @paycall-live/sdk   # or bun add / pnpm add`}</Pre>,
          },
          {
            id: 'key',
            title: 'Get a key',
            body: (
              <>
                <P>
                  Easiest: run <C>npx -y @paycall-live/mcp login</C> and approve the code. It writes <C>{`{ privateKey, pubkey, name }`}</C> to{' '}
                  <C>~/.config/paycall/agent.json</C>. Or make one with <C>generateKey()</C> and register the pubkey under your owner (<C>POST /agents</C>).
                </P>
              </>
            ),
          },
          {
            id: 'usage',
            title: 'Usage',
            body: (
              <>
                <Pre title="agent.ts">{`
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createAgent, decodePaymentHeader, usd } from '@paycall-live/sdk'

const { privateKey } = JSON.parse(await readFile(\`\${homedir()}/.config/paycall/agent.json\`, 'utf8'))
const agent = await createAgent(privateKey)

const res = await agent.fetch('${API}/p/<endpointId>/search?q=shoes')
if (res.status === 402) console.log('not paid:', decodePaymentHeader(res.headers.get('payment-required'))?.error)
else console.log(await res.json(), 'spent', usd(agent.spent))`}</Pre>
                <P>Runs in Node, Bun, Workers and browsers (WebCrypto, no Buffer).</P>
              </>
            ),
          },
          {
            id: 'api',
            title: 'API',
            body: (
              <Tbl
                head={['Export', 'Does']}
                rows={[
                  [<C key="c">generateKey()</C>, <><C>{'{ privateKey, pubkey }'}</C>: pkcs8 and raw public key, base64url.</>],
                  [<C key="c">createAgent(privateKey, {'{ fetch? }'})</C>, <><C>{'{ pubkey, fetch, spent }'}</C>. <C>spent</C> is micros this session.</>],
                  [<C key="c">agent.fetch(input, init?)</C>, 'Like fetch. On a paycall-prepaid 402: signs a voucher and retries. Sends PAYCALL-AGENT to pass sellers.'],
                  [<C key="c">decodePaymentHeader(h)</C>, 'Base64 JSON header → object (or undefined).'],
                  [<C key="c">verifyReceipt(jws, {'{ jwksUrl?, fetch? }'})</C>, 'Receipt payload if the signature is valid.'],
                  [<C key="c">describeResponse(res, opts?)</C>, <>Paid response as text for LLM tools: <C>{'{ text, isError }'}</C>. Reads the SSE receipt trailer.</>],
                  [<C key="c">usd(micros)</C>, 'Format micros, e.g. $0.00002.'],
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: 'guides/middleware',
        title: 'Seller middleware',
        description: 'Charge per request on your own server: Next.js, Bun, Workers, Hono, Express.',
        intro: (
          <P>
            Unpaid requests get a <C>402</C> with <C>PAYMENT-REQUIRED</C>. Paid requests are verified, your handler runs, and the buyer is charged only if it returns 2xx.
            No PayCall proxy needed.
          </P>
        ),
        sections: [
          {
            id: 'install',
            title: 'Install',
            body: (
              <>
                <Pre>{`npm i @paycall-live/middleware   # or bun add / pnpm add`}</Pre>
                <P>Seller API key: dashboard → Earn → API key (<C>pc_seller_…</C>, shown once).</P>
                <Pre>{`const opts = { apiKey: process.env.PAYCALL_KEY!, price: '0.01' } // dollars; facilitator? defaults to ${API}`}</Pre>
              </>
            ),
          },
          {
            id: 'next',
            title: 'Next.js route handler',
            body: (
              <Pre title="app/api/joke/route.ts">{`
import { withPaycall } from '@paycall-live/middleware'

export const GET = withPaycall(async () => Response.json({ joke: '...' }), opts)`}</Pre>
            ),
          },
          {
            id: 'bun',
            title: 'Bun, Workers, Deno',
            body: (
              <>
                <P>Any <C>(Request) =&gt; Response</C> handler:</P>
                <Pre>{`
import { withPaycall } from '@paycall-live/middleware'

Bun.serve({ fetch: withPaycall((req) => Response.json({ ok: true }), opts) })
// Workers: export default { fetch: withPaycall(handler, opts) }`}</Pre>
              </>
            ),
          },
          {
            id: 'hono',
            title: 'Hono',
            body: (
              <Pre>{`
import { paycallHono } from '@paycall-live/middleware'

app.use('/paid/*', paycallHono(opts))
app.get('/paid/joke', (c) => c.json({ joke: '...' }))`}</Pre>
            ),
          },
          {
            id: 'express',
            title: 'Express',
            body: (
              <>
                <Pre>{`
import { paycallExpress } from '@paycall-live/middleware'

app.use('/paid', paycallExpress(opts))
app.get('/paid/joke', (req, res) => res.json({ joke: '...' }))`}</Pre>
                <P>
                  Settle runs when your handler calls <C>res.end</C> (<C>res.send</C>, <C>res.json</C>), so a failed settle can still become a 402. If you stream with{' '}
                  <C>res.write</C> first, headers are already out: a settle failure is only logged, and you are not paid.
                </P>
              </>
            ),
          },
          {
            id: 'metered',
            title: 'Metered',
            body: (
              <>
                <P>
                  With <C>metered: true</C>, <C>price</C> is the cap the agent signs. Report actual use in dollars in the <C>x-paycall-charge</C> header (exported as{' '}
                  <C>CHARGE_HEADER</C>). PayCall keeps that and refunds the rest. The header is stripped before the reply goes out.
                </P>
                <Pre>{`
withPaycall(async (req) => {
  const out = await runModel(req)
  return Response.json(out, { headers: { 'x-paycall-charge': String(out.usage.output_tokens * 0.00001) } })
}, { ...opts, metered: true, price: '0.05' })`}</Pre>
              </>
            ),
          },
          {
            id: 'other',
            title: 'Other frameworks',
            body: (
              <P>
                <C>paycall(opts)</C> returns <C>gate(request)</C>, which resolves to either a 402 <C>Response</C> to send as-is, or a <C>settle(response)</C> function to call after your
                handler succeeds. <C>settle</C> returns <C>{'{ ok: true, header }'}</C> (set it as <C>PAYMENT-RESPONSE</C>) or <C>{'{ ok: false, res }'}</C> (send that 402 instead).
              </P>
            ),
          },
          {
            id: 'rules',
            title: 'Rules',
            body: (
              <Ul
                items={[
                  'Handler returns non-2xx: no charge, your response is passed through.',
                  'Settle fails (e.g. the buyer ran out of funds mid-request): 402, your body is withheld.',
                  'A bad fixed price throws at startup; price must be > 0.',
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: 'guides/list-an-api',
        title: 'Listing an API',
        description: 'Put a price on any HTTPS API behind the PayCall proxy. No code.',
        sections: [
          {
            id: 'create',
            title: 'Create an endpoint',
            body: (
              <>
                <P>
                  Dashboard → <b className="font-normal text-foreground">Earn → New endpoint</b>, or <C>POST /endpoints</C> with your seller key:
                </P>
                <Pre>{`
curl -X POST ${API}/endpoints \\
  -H "authorization: Bearer $PAYCALL_KEY" -H "content-type: application/json" \\
  -d '{
    "name": "Product search",
    "description": "Search products across stores",
    "category": "shopping",
    "upstreamUrl": "https://api.example.com/v1",
    "price": 5000,
    "pricing": "call",
    "upstreamHeaders": { "x-api-key": "sk_…" }
  }'`}</Pre>
              </>
            ),
          },
          {
            id: 'fields',
            title: 'Fields',
            body: (
              <Tbl
                head={['Field', 'Notes']}
                rows={[
                  [<C key="c">upstreamUrl</C>, 'HTTPS only. Trailing slashes trimmed.'],
                  [<C key="c">price</C>, 'Micros. Per call, per token, per char, or per pass.'],
                  [<C key="c">pricing</C>, <><C>call</C> | <C>token</C> | <C>char</C> | <C>pass</C> (default <C>call</C>).</>],
                  [<C key="c">maxAmount</C>, 'Required for token / char: the cap per call the agent signs.'],
                  [<C key="c">passSeconds</C>, 'Required for pass: 60 s to 30 days.'],
                  [<C key="c">upstreamHeaders</C>, 'Up to 10 headers, stored encrypted, never returned. Hop-by-hop, cookie, payment-*, cf-* and x-forwarded-* are reserved.'],
                  [<><C>name</C>, <C>description</C>, <C>category</C></>, 'Shown in the catalog and in search_paid_apis.'],
                ]}
              />
            ),
          },
          {
            id: 'proxy',
            title: 'How the proxy forwards',
            body: (
              <Ul
                items={[
                  <>Paid URL <C>{API}/p/&lt;id&gt;/rest?x=1</C> → <C>&lt;upstreamUrl&gt;/rest?x=1</C>, same method and body.</>,
                  'Caller headers are forwarded except host, authorization, cookie, payment-*, paycall-*, cf-* and x-forwarded-*. Your upstream headers win.',
                  'Upstream timeout is 30 s. Unreachable: 502 upstream_unreachable, no charge. Non-2xx: passed through, no charge.',
                  <>Manage with <C>GET /endpoints</C>, <C>PATCH /endpoints/:id</C>, <C>DELETE /endpoints/:id</C>.</>,
                ]}
              />
            ),
          },
          {
            id: 'verified',
            title: 'Verified listings',
            body: <P>Listings reviewed by a PayCall admin get a verified mark in the catalog and in MCP search results, and are listed first.</P>,
          },
        ],
      },
    ],
  },
  {
    title: 'Reference',
    pages: [
      {
        slug: 'reference/x402',
        title: 'x402 headers',
        description: 'PAYMENT-REQUIRED, PAYMENT-SIGNATURE and PAYMENT-RESPONSE: shapes and examples.',
        intro: <P>All three headers are base64-encoded JSON. Amounts are strings of integer micros.</P>,
        sections: [
          {
            id: 'payment-required',
            title: 'PAYMENT-REQUIRED',
            body: (
              <>
                <P>Sent with every 402. The body is the same JSON. <C>error</C> is a <A href="/docs/reference/errors">reason code</A>.</P>
                <Pre>{`
{
  "x402Version": 2,
  "error": "payment_required",
  "resource": { "url": "${API}/p/ep_…" },
  "accepts": [{
    "scheme": "paycall-prepaid",
    "network": "paypal:sandbox",
    "amount": "5000",
    "asset": "USD",
    "payTo": "sel_…",
    "maxTimeoutSeconds": 60,
    "extra": {
      "facilitator": "${API}",
      "pricing": { "unit": "token", "rate": "10", "max": "50000" },  // metered only
      "pass": { "seconds": 3600 }                                      // pass only
    }
  }]
}`}</Pre>
              </>
            ),
          },
          {
            id: 'payment-signature',
            title: 'PAYMENT-SIGNATURE',
            body: (
              <>
                <P>Sent by the agent on the retry. <C>accepted</C> must equal the offered requirements (scheme, network, amount, asset, payTo).</P>
                <Pre>{`
{
  "x402Version": 2,
  "accepted": { …accepts[0] },
  "payload": {
    "channelId": "…", "payer": "…", "payTo": "sel_…",
    "cumulativeAmount": "15000", "currency": "USD", "seq": 3, "expiry": 1767225600,
    "sig": "<base64url Ed25519>"
  }
}`}</Pre>
              </>
            ),
          },
          {
            id: 'payment-response',
            title: 'PAYMENT-RESPONSE',
            body: (
              <>
                <Pre>{`
{
  "success": true,
  "payer": "<agent pubkey>",
  "transaction": "812",          // charge id: use for refunds and disputes
  "network": "paypal:sandbox",
  "amount": "5000",              // micros charged
  "units": 412, "unit": "token", "refunded": "45880",   // metered
  "pass": { "expiresAt": "…" },   // pass
  "receipt": "eyJ…"               // proxy only
}`}</Pre>
                <P>
                  Metered SSE: the header has <C>{`{ "metered": true, "max": "…" }`}</C> and the final numbers come in the <C>paycall-receipt</C> event. A pass hit has{' '}
                  <C>pass</C> and no <C>transaction</C>.
                </P>
              </>
            ),
          },
          {
            id: 'paycall-agent',
            title: 'PAYCALL-AGENT',
            body: (
              <P>
                Pass identity, not payment: <C>&lt;pubkey&gt;.&lt;ts&gt;.&lt;nonce&gt;.&lt;sig&gt;</C>. See <A href="/docs/pricing#time-pass">Time pass</A>.
              </P>
            ),
          },
        ],
      },
      {
        slug: 'reference/api',
        title: 'HTTP API',
        description: `Routes on ${API}. Auth is Bearer pc_owner_… or pc_seller_….`,
        sections: [
          {
            id: 'auth',
            title: 'Auth',
            body: (
              <P>
                <C>authorization: Bearer pc_owner_…</C> for buyer routes, <C>pc_seller_…</C> for seller routes. Errors are JSON <C>{`{ "error": "…" }`}</C>: 401{' '}
                <C>invalid api key</C>, 404 unknown thing, 409 business rule (reason code), 500 <C>internal_error</C>.
              </P>
            ),
          },
          {
            id: 'facilitator',
            title: 'Facilitator',
            body: (
              <Tbl
                head={['Route', 'Auth', 'Does']}
                rows={[
                  [<C key="c">GET /supported</C>, 'public', 'x402 kinds: paycall-prepaid on paypal:sandbox.'],
                  [<C key="c">POST /verify</C>, 'seller', <><C>{'{ x402Version, paymentPayload, paymentRequirements }'}</C> → <C>{'{ isValid, invalidReason?, payer }'}</C>. Read-only.</>],
                  [<C key="c">POST /settle</C>, 'seller', <>Same body → <C>{'{ success, errorReason?, payer, transaction, network }'}</C>.</>],
                  [<C key="c">GET /channels/:pubkey/:sellerId</C>, 'public', <><C>{'{ channelId, seq, cumulative }'}</C> or 404 <C>no_channel</C>.</>],
                  [<C key="c">GET /.well-known/jwks.json</C>, 'public', 'Receipt signing keys.'],
                  [<C key="c">ANY /p/:endpointId/*</C>, 'x402', 'The paid proxy.'],
                  [<C key="c">GET /catalog?q=</C>, 'public', 'Up to 50 listings, verified first.'],
                ]}
              />
            ),
          },
          {
            id: 'buyer',
            title: 'Buyer',
            body: (
              <Tbl
                head={['Route', 'Does']}
                rows={[
                  [<C key="c">GET /owners/me</C>, 'Owner, agents, spend by seller.'],
                  [<C key="c">PATCH /owners/me</C>, <C key="b">{`{ reloadBelow?, reloadAmount?, dailyCap? }`}</C>],
                  [<C key="c">POST /agents</C>, <C key="b">{`{ pubkey, name, maxPrice? }`}</C>],
                  [<C key="c">PATCH /agents/:pubkey</C>, <C key="b">{`{ name?, paused?, maxPrice?, dailyCap?, approveAbove?, allowedSellers? }`}</C>],
                  [<C key="c">DELETE /agents/:pubkey</C>, 'Revoke (also kills hosted MCP grants for that key).'],
                  [<C key="c">GET /approvals</C>, 'Pending approvals.'],
                  [<C key="c">POST /approvals/:id</C>, <C key="b">{`{ approve: boolean }`}</C>],
                  [<C key="c">POST /topup/create</C>, <><C>{`{ amount }`}</C> micros, $1–$500 in whole cents → PayPal order id.</>],
                  [<C key="c">POST /topup/capture</C>, <C key="b">{`{ orderId }`}</C>],
                  [<C key="c">POST /entries/:id/dispute</C>, <C key="b">{`{ reason }`}</C>],
                  [<C key="c">POST /disputes/:id/escalate</C>, 'Escalate a seller rejection.'],
                ]}
              />
            ),
          },
          {
            id: 'seller',
            title: 'Seller',
            body: (
              <Tbl
                head={['Route', 'Does']}
                rows={[
                  [<C key="c">GET /sellers/me</C>, 'Seller, earned, refunded, held, owed, last 20 payouts.'],
                  [<C key="c">POST /sellers/me/key</C>, 'Rotate the API key. The old key stops working now.'],
                  [<C key="c">POST /endpoints</C>, <A key="a" href="/docs/guides/list-an-api#fields">Create a listing</A>],
                  [<C key="c">GET /endpoints</C>, 'Your listings (secrets never returned, only hasAuth).'],
                  [<C key="c">PATCH /endpoints/:id</C>, 'Partial update. upstreamHeaders: object = replace, null = clear.'],
                  [<C key="c">DELETE /endpoints/:id</C>, 'Delete a listing.'],
                  [<C key="c">POST /entries/:id/refund</C>, <C key="b">{`{ amount? }`}</C>],
                  [<C key="c">POST /disputes/:id</C>, <C key="b">{`{ action, reply? }`}</C>],
                ]}
              />
            ),
          },
          {
            id: 'shared',
            title: 'Both',
            body: (
              <Tbl
                head={['Route', 'Does']}
                rows={[
                  [<C key="c">GET /entries?limit=&amp;before=</C>, 'Ledger rows (charge, refund, topup, reload, payout, fee), newest first, up to 500.'],
                  [<C key="c">GET /events</C>, 'Live activity as SSE. ?key= works where headers cannot be set.'],
                  [<C key="c">GET /disputes</C>, 'Your disputes.'],
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: 'reference/errors',
        title: 'Error codes',
        description: 'Every reason code PayCall returns, what it means, and how to fix it.',
        intro: (
          <P>
            Payment failures come back as <C>402</C> with the code in <C>PAYMENT-REQUIRED.error</C> (and <C>invalidReason</C> / <C>errorReason</C> from <C>/verify</C> and{' '}
            <C>/settle</C>). Refund and dispute failures are <C>409</C> <C>{`{ "error": code }`}</C>.
          </P>
        ),
        sections: [
          {
            id: 'buyer',
            title: 'Buyer fixable',
            body: (
              <Tbl
                head={['Code', 'Meaning', 'Fix']}
                rows={[
                  [<C key="c">insufficient_funds</C>, 'Balance below the price.', 'Top up in Spend, or turn on auto-reload.'],
                  [<C key="c">daily_cap_exceeded</C>, 'Owner daily cap reached (net spend today).', 'Raise it in Auto-reload & limits, or wait until tomorrow.'],
                  [<C key="c">agent_daily_cap_exceeded</C>, "This agent's daily cap reached.", "Raise the agent's cap, or wait."],
                  [<C key="c">price_above_agent_limit</C>, "Price above the agent's max price per call.", 'Raise max price on the agent.'],
                  [<C key="c">approval_required</C>, 'Price above the approval threshold.', 'Approve in Spend → Approvals, then retry the same call.'],
                  [<C key="c">seller_not_allowed</C>, "Seller not in the agent's allowlist.", 'Allow the seller on the agent.'],
                  [<C key="c">agent_paused</C>, 'Agent is paused (or was replaced by a new login).', 'Unpause it, or use the new key.'],
                  [<C key="c">unknown_payer</C>, 'Agent key not registered, or removed.', 'Connect again (login or Authenticate).'],
                ]}
              />
            ),
          },
          {
            id: 'retry',
            title: 'Retry',
            body: (
              <Tbl
                head={['Code', 'Meaning', 'Fix']}
                rows={[
                  [<C key="c">stale_voucher</C>, 'Voucher does not continue the channel (seq / total).', 'Refetch the channel and sign again. The SDK does this once.'],
                  [<C key="c">channel_mismatch</C>, 'Wrong channel id for this agent and seller.', 'Refetch the channel. The SDK does this once.'],
                  [<C key="c">voucher_expired</C>, 'expiry is in the past.', 'Check the clock and retry.'],
                  [<C key="c">duplicate_voucher</C>, 'Voucher already settled by a parallel call.', 'Serialize calls per seller (the SDK does).'],
                ]}
              />
            ),
          },
          {
            id: 'integration',
            title: 'Integration bugs',
            body: (
              <Tbl
                head={['Code', 'Meaning']}
                rows={[
                  [<C key="c">payment_required</C>, 'No PAYMENT-SIGNATURE sent. Normal first response.'],
                  [<C key="c">invalid_payment_header</C>, 'PAYMENT-SIGNATURE is not base64 JSON.'],
                  [<C key="c">invalid_payload</C>, 'Payload shape is wrong (zod validation).'],
                  [<C key="c">invalid_signature</C>, 'Ed25519 signature does not match the voucher fields.'],
                  [<C key="c">requirements_mismatch</C>, 'accepted differs from what the server offered.'],
                  [<C key="c">invalid_payee</C>, 'payTo is not this seller.'],
                  [<C key="c">invalid_amount</C>, 'Amount is zero.'],
                  [<><C>settle_failed</C>, <C>invalid_payment</C></>, 'Middleware fallbacks when the facilitator gives no reason.'],
                ]}
              />
            ),
          },
          {
            id: 'refunds',
            title: 'Refunds and disputes',
            body: (
              <Tbl
                head={['Code', 'Meaning']}
                rows={[
                  [<C key="c">unknown_charge</C>, 'No such charge for you.'],
                  [<C key="c">already_refunded</C>, 'Nothing left to refund or dispute.'],
                  [<C key="c">refund_exceeds_charge</C>, 'Refund larger than what is left.'],
                  [<C key="c">dispute_window_closed</C>, 'Charge is older than 7 days.'],
                  [<C key="c">already_disputed</C>, 'One dispute per charge.'],
                  [<C key="c">unknown_dispute</C>, 'Not found, or not open for you to decide.'],
                  [<C key="c">not_escalatable</C>, 'Only a seller rejection, once, within 3 days.'],
                ]}
              />
            ),
          },
          {
            id: 'proxy',
            title: 'Proxy',
            body: (
              <Tbl
                head={['Status', 'Meaning']}
                rows={[
                  [<C key="c">404 unknown endpoint</C>, 'No listing with that id.'],
                  [<C key="c">502 upstream_unreachable</C>, 'Upstream failed or took over 30 s. Not charged.'],
                ]}
              />
            ),
          },
        ],
      },
      {
        slug: 'limits',
        title: 'Limits and roadmap',
        description: 'Numbers worth knowing, and what comes next.',
        sections: [
          {
            id: 'limits',
            title: 'Limits',
            body: (
              <Tbl
                head={['What', 'Value']}
                rows={[
                  ['Network', 'PayPal sandbox only (US accounts)'],
                  ['Top-up', '$1 to $500, whole cents'],
                  ['Voucher expiry (SDK)', '5 minutes'],
                  ['PAYCALL-AGENT window', '±5 minutes, single-use nonce'],
                  ['Upstream timeout', '30 s'],
                  ['Replay cache', '1 h, ≤ 512 KB bodies'],
                  ['Payouts', 'Every 10 min, $0.50 minimum, 2% fee'],
                  ['Disputes', '7 day window, 3 day answer, 3 day escalation'],
                  ['Device login code', '10 minutes'],
                  ['Catalog search', '50 results'],
                  ['paid_fetch body', '20k chars'],
                ]}
              />
            ),
          },
          {
            id: 'roadmap',
            title: 'Roadmap',
            body: (
              <Ul
                items={[
                  <><b className="font-normal text-foreground">Next: paid MCP servers via the catalog.</b> List an MCP server and let agents pay per tool call, discovered through search_paid_apis.</>,
                ]}
              />
            ),
          },
        ],
      },
    ],
  },
]

export const pages = groups.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })))
export const href = (slug: string) => (slug ? `/docs/${slug}` : '/docs')

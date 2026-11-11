import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { and, eq, gte, sql } from 'drizzle-orm'
import { createAgent, decodePaymentHeader } from 'paycall-sdk'
import { z } from 'zod'
import type { McpProps } from './controllers/oauth.controller'
import { connect } from './db'
import { agents, entries, owners } from './db/schema'
import { spentToday } from './ledger'
import { searchCatalog } from './controllers/catalog.controller'

type App = { fetch: (req: Request, env: CloudflareBindings, ctx: ExecutionContext) => Response | Promise<Response> }

const MAX_BODY = 20_000
const REASONS: Record<string, string> = {
  insufficient_funds: 'insufficient balance: top up in the PayCall dashboard',
  agent_paused: 'this agent is paused: unpause it in the PayCall dashboard',
  daily_cap_exceeded: 'daily spending cap reached: raise it in the PayCall dashboard or wait until tomorrow',
  price_above_agent_limit: "price is above this agent's max price per call: raise it in the PayCall dashboard",
  unknown_payer: 'this agent was removed: reconnect PayCall (/mcp → paycall → Authenticate)',
  stale_voucher: 'payment channel out of sync: retry the call',
  voucher_expired: 'voucher expired (clock skew?): retry the call',
  seller_not_allowed: "this seller is not in the agent's allowlist: allow it in the PayCall dashboard",
  agent_daily_cap_exceeded: "this agent's daily cap reached: raise it in the PayCall dashboard or wait until tomorrow",
  approval_required: 'price is above the approval threshold: the user must approve it in the PayCall dashboard (Spend → Approvals), then retry the same call',
}
const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], isError })
// sub-cent prices are normal: up to 6 decimals, at least 2
const usd = (m: number) => `$${(m / 1e6).toFixed(6).replace(/(\.\d\d\d*?)0+$/, '$1')}`
// "$0.01/call" | "$0.00001/token, max $0.05/call" | "$0.10 for 1h pass"
const priceText = (r: { price: number; pricing: string; maxAmount: number | null; passSeconds: number | null }) =>
  r.pricing === 'pass'
    ? `${usd(r.price)} for ${r.passSeconds! >= 3600 ? `${r.passSeconds! / 3600}h` : `${r.passSeconds! / 60}min`} pass`
    : r.pricing === 'call'
      ? `${usd(r.price)}/call`
      : `${usd(r.price)}/${r.pricing}, max ${usd(r.maxAmount!)}/call`

function server(props: McpProps, agent: Awaited<ReturnType<typeof createAgent>>, env: CloudflareBindings, origin: string) {
  const s = new McpServer({ name: 'paycall', version: '0.3.0' })

  s.registerTool(
    'paid_fetch',
    {
      description:
        "HTTP fetch that automatically pays for x402 (HTTP 402 Payment Required) resources from the user's prepaid PayCall balance. Use it for any URL that may require payment, e.g. PayCall proxy URLs.",
      inputSchema: z.object({ url: z.url(), method: z.string().optional(), headers: z.record(z.string(), z.string()).optional(), body: z.string().optional() }),
    },
    async ({ url, method, headers, body }) => {
      let res: Response
      try {
        res = await agent.fetch(url, { method, headers, body })
      } catch (e) {
        return text(`request failed: ${(e as Error).message}`, true)
      }
      if (res.status === 402) {
        const pr = decodePaymentHeader(res.headers.get('payment-required'))
        const offered = pr?.accepts?.some((a: { scheme?: string }) => a.scheme === 'paycall-prepaid')
        return text(`HTTP 402: ${!offered ? 'payment required, but the server does not accept PayCall' : (REASONS[pr.error] ?? `payment failed: ${pr.error}`)}`, true)
      }
      const lines = [`HTTP ${res.status}`]
      const b = await res.text()
      // metered sse: final charge arrives as a trailing event, header only has the cap
      const trailer = b.match(/event: paycall-receipt\ndata: (.+)/)?.[1]
      const paid = (trailer && JSON.parse(trailer)) || decodePaymentHeader(res.headers.get('payment-response'))
      if (paid?.pass && !paid.transaction) lines.push(`free: time pass active until ${paid.pass.expiresAt}`)
      else if (paid?.success)
        lines.push(
          `paid ${usd(Number(paid.amount ?? agent.spent))} from PayCall balance (tx ${paid.transaction})` +
            (paid.units !== undefined ? `, metered ${paid.units} ${paid.unit === 'char' ? 'chars' : 'tokens'}, ${usd(Number(paid.refunded))} of the cap refunded` : '') +
            (paid.pass ? `, pass valid until ${paid.pass.expiresAt}` : '') +
            (paid.receipt ? '\nsigned receipt (verify at /.well-known/jwks.json): ' + paid.receipt : ''),
        )
      lines.push('', b.length > MAX_BODY ? `${b.slice(0, MAX_BODY)}\n…[truncated, ${b.length} chars total]` : b)
      return text(lines.join('\n'), !res.ok)
    },
  )

  s.registerTool(
    'search_paid_apis',
    {
      description: 'Search the PayCall catalog of paid APIs (name, description, price per call, URL). Prefer ✓ verified listings (reviewed by PayCall). Call the returned URL with paid_fetch.',
      inputSchema: z.object({ query: z.string().max(100).optional().describe('keywords, e.g. "weather" or "flights"; empty = newest') }),
    },
    async ({ query }) => {
      const { db, close } = await connect(env.HYPERDRIVE.connectionString)
      try {
        const rows = await searchCatalog(db, origin, query)
        if (!rows.length) return text(`no paid APIs match "${query ?? ''}"`)
        return text(rows.map((r) => `${r.verified ? '✓ verified · ' : ''}${r.name} (${r.seller}) ${priceText(r)}${r.category ? ` [${r.category}]` : ''}\n  ${r.url}${r.description ? `\n  ${r.description}` : ''}`).join('\n'))
      } finally {
        await close()
      }
    },
  )

  s.registerTool('wallet_info', { description: 'PayCall balance, spend today vs daily cap, and this agent’s status.', inputSchema: z.object({}) }, async () => {
    const { db, close } = await connect(env.HYPERDRIVE.connectionString)
    try {
      const [o] = await db.select().from(owners).where(eq(owners.id, props.ownerId))
      const [a] = await db.select().from(agents).where(eq(agents.pubkey, props.agentPubkey))
      const today = await spentToday(db, { ownerId: props.ownerId })
      if (!o || !a || a.deletedAt) return text('agent not found (removed?): reconnect PayCall', true)
      return text(
        [
          `agent: ${a.name}${a.paused ? ' (paused)' : ''}, max ${usd(a.maxPrice)}/call`,
          `balance: ${usd(o.balance)}`,
          `spent today: ${usd(today)} of ${usd(o.dailyCap)} daily cap`,
          o.vaultId && o.reloadBelow > 0 ? `auto-reload: +${usd(o.reloadAmount)} when below ${usd(o.reloadBelow)}` : 'auto-reload: off',
        ].join('\n'),
      )
    } finally {
      await close()
    }
  })
  return s
}

// apiHandler behind OAuthProvider: ctx.props = decrypted grant props
export const mcpHandler = (app: App) => ({
  async fetch(req: Request, env: CloudflareBindings, ctx: ExecutionContext) {
    const props = (ctx as ExecutionContext & { props: McpProps }).props
    const self = new URL(req.url).origin
    // own urls (proxy /p, /channels) in-process: workers.dev self-fetch = 1042 / loop
    const f = ((input: RequestInfo | URL, init?: RequestInit) => {
      const r = new Request(input, init)
      return new URL(r.url).origin === self ? app.fetch(r, env, ctx) : fetch(r)
    }) as typeof fetch
    const agent = await createAgent(props.privateKey, { fetch: f })
    // ponytail: handler + server built per request (stateless, cheap); cache if profiling says so
    return createMcpHandler(() => server(props, agent, env, self))(req, env, ctx)
  },
})

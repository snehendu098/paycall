import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { and, eq, gte, sql } from 'drizzle-orm'
import { createAgent, decodePaymentHeader } from 'paycall-sdk'
import { z } from 'zod'
import type { McpProps } from './controllers/oauth.controller'
import { connect } from './db'
import { agents, entries, owners } from './db/schema'
import { toDollars } from './lib/util'

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
}
const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], isError })
const usd = (m: number) => `$${toDollars(m)}`

function server(props: McpProps, agent: Awaited<ReturnType<typeof createAgent>>, env: CloudflareBindings) {
  const s = new McpServer({ name: 'paycall', version: '0.2.0' })

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
      const receipt = decodePaymentHeader(res.headers.get('payment-response'))
      if (receipt?.success) lines.push(`paid ${usd(agent.spent)} from PayCall balance (tx ${receipt.transaction})`) // fresh agent per request → spent = this call
      const b = await res.text()
      lines.push('', b.length > MAX_BODY ? `${b.slice(0, MAX_BODY)}\n…[truncated, ${b.length} chars total]` : b)
      return text(lines.join('\n'), !res.ok)
    },
  )

  s.registerTool('wallet_info', { description: 'PayCall balance, spend today vs daily cap, and this agent’s status.', inputSchema: z.object({}) }, async () => {
    const { db, close } = await connect(env.HYPERDRIVE.connectionString)
    try {
      const [o] = await db.select().from(owners).where(eq(owners.id, props.ownerId))
      const [a] = await db.select().from(agents).where(eq(agents.pubkey, props.agentPubkey))
      const [{ today }] = await db
        .select({ today: sql<number>`coalesce(sum(${entries.amount}), 0)::bigint`.mapWith(Number) })
        .from(entries)
        .where(and(eq(entries.ownerId, props.ownerId), eq(entries.type, 'charge'), gte(entries.createdAt, sql`date_trunc('day', now())`)))
      if (!o || !a) return text('agent not found: reconnect PayCall', true)
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
    return createMcpHandler(() => server(props, agent, env))(req, env, ctx)
  },
})

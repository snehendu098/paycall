import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { and, eq, gte, sql } from 'drizzle-orm'
import { createAgent, describeResponse, usd } from '@paycall-live/sdk'
import { z } from 'zod'
import type { McpProps } from './controllers/oauth.controller'
import { connect } from './db'
import { agents, entries, owners } from './db/schema'
import { spentToday } from './ledger'
import { searchCatalog } from './controllers/catalog.controller'

type App = { fetch: (req: Request, env: CloudflareBindings, ctx: ExecutionContext) => Response | Promise<Response> }

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], isError })
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
      const d = await describeResponse(res, { reasons: { unknown_payer: 'this agent was removed: reconnect PayCall (/mcp → paycall → Authenticate)' }, spent: agent.spent })
      return text(d.text, d.isError)
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

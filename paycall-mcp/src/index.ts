import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createAgent, decodePaymentHeader } from 'paycall-sdk'
import { z } from 'zod'

const key = process.env.PAYCALL_AGENT_KEY
if (!key) {
  console.error('paycall-mcp: PAYCALL_AGENT_KEY missing. Get one in PayCall dashboard → Buyer → Add agent.')
  process.exit(1)
}
const agent = await createAgent(key).catch(() => {
  console.error('paycall-mcp: PAYCALL_AGENT_KEY is not a valid Ed25519 pkcs8 key')
  process.exit(1)
})

const MAX_BODY = 20_000
const usd = (micros: number) => `$${micros / 1e6}`
const REASONS: Record<string, string> = {
  insufficient_funds: 'insufficient balance: top up in the PayCall dashboard',
  agent_paused: 'this agent is paused: unpause it in the PayCall dashboard',
  daily_cap_exceeded: 'daily spending cap reached: raise it in the PayCall dashboard or wait until tomorrow',
  price_above_agent_limit: "price is above this agent's max price per call: raise it in the PayCall dashboard",
  unknown_payer: 'this agent key is not registered: add it in PayCall dashboard → Buyer → Add agent',
  stale_voucher: 'payment channel out of sync: retry the call',
  voucher_expired: 'voucher expired (clock skew?): retry the call',
}
const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], isError })

const server = new McpServer({ name: 'paycall', version: '0.1.0' })

server.registerTool(
  'paid_fetch',
  {
    description:
      'HTTP fetch that automatically pays for x402 (HTTP 402 Payment Required) resources. Use this for any URL that may require payment (HTTP 402), e.g. PayCall proxy URLs. Payments come from the user\'s prepaid PayCall balance.',
    inputSchema: {
      url: z.string().url(),
      method: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.string().optional(),
    },
  },
  async ({ url, method, headers, body }) => {
    const before = agent.spent
    let res: Response
    try {
      res = await agent.fetch(url, { method, headers, body })
    } catch (e) {
      return text(`request failed: ${(e as Error).message}`, true)
    }
    if (res.status === 402) {
      const pr = decodePaymentHeader(res.headers.get('payment-required'))
      const offered = pr?.accepts?.some((a: { scheme?: string }) => a.scheme === 'paycall-prepaid')
      const why = !offered ? 'payment required, but the server does not accept PayCall' : (REASONS[pr.error] ?? `payment failed: ${pr.error}`)
      return text(`HTTP 402: ${why}`, true)
    }
    const lines = [`HTTP ${res.status}`]
    const receipt = decodePaymentHeader(res.headers.get('payment-response'))
    // ponytail: spent delta, wrong if parallel paid_fetch calls overlap; sdk per-call receipt if needed
    if (receipt?.success) lines.push(`paid ${usd(agent.spent - before)} from PayCall balance (tx ${receipt.transaction})`)
    const b = await res.text()
    lines.push('', b.length > MAX_BODY ? `${b.slice(0, MAX_BODY)}\n…[truncated, ${b.length} chars total]` : b)
    return text(lines.join('\n'), !res.ok)
  },
)

server.registerTool('wallet_info', { description: 'PayCall agent pubkey and amount spent this session.', inputSchema: {} }, async () =>
  text(`pubkey: ${agent.pubkey}\nspent this session: ${usd(agent.spent)}`),
)

await server.connect(new StdioServerTransport())
console.error(`paycall-mcp ready, agent ${agent.pubkey.slice(0, 12)}…`)

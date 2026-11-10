import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createAgent, decodePaymentHeader } from 'paycall-sdk'
import { z } from 'zod'
import { KEY_FILE, loadKey, login, openBrowser, type Started } from './login'

// cli: `bun run src/index.ts login [name]`
if (process.argv[2] === 'login') {
  const s = await login(process.argv[3]).catch((e) => (console.error(`paycall: ${e.message}`), process.exit(1)))
  console.log(`\n  Open ${s.verificationUri}\n  and enter code:  ${s.userCode}\n\n  Waiting for approval…`)
  openBrowser(s.verificationUri)
  const r = await s.done
  console.log(r === 'approved' ? `  Connected. Key saved to ${KEY_FILE}` : '  Code expired. Run login again.')
  process.exit(r === 'approved' ? 0 : 1)
}

// key read per call → login (cli or tool) takes effect without restarting mcp
let cached: { key: string; agent: Awaited<ReturnType<typeof createAgent>> } | undefined
async function getAgent() {
  const key = await loadKey()
  if (!key) return
  if (cached?.key !== key) cached = { key, agent: await createAgent(key) }
  return cached.agent
}
let pending: Started | undefined
const NOT_LOGGED_IN = 'not logged in to PayCall: call the login tool, then the user approves the code in the browser'
const MAX_BODY = 20_000
const usd = (micros: number) => `$${micros / 1e6}`
const REASONS: Record<string, string> = {
  insufficient_funds: 'insufficient balance: top up in the PayCall dashboard',
  agent_paused: 'this agent is paused: unpause it in the PayCall dashboard',
  daily_cap_exceeded: 'daily spending cap reached: raise it in the PayCall dashboard or wait until tomorrow',
  price_above_agent_limit: "price is above this agent's max price per call: raise it in the PayCall dashboard",
  unknown_payer: 'this agent key is not registered (or was replaced): call the login tool to connect again',
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
    const agent = await getAgent().catch(() => undefined)
    if (!agent) return text(NOT_LOGGED_IN, true)
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

server.registerTool(
  'login',
  {
    description:
      "Connect this agent to the user's PayCall wallet. Makes a new key on this machine and returns a URL + code; tell the user to open the URL, log in and enter the code. Use when paid_fetch says not logged in / unknown_payer, or the user asks to log in to PayCall.",
    inputSchema: { name: z.string().min(1).max(64).optional().describe('agent name shown in the dashboard, e.g. claude-code') },
  },
  async ({ name }) => {
    try {
      const s = (pending = await login(name ?? 'claude'))
      s.done.finally(() => pending === s && (pending = undefined))
      openBrowser(s.verificationUri)
      return text(`Ask the user to open ${s.verificationUri}, log in, and enter code ${s.userCode} (expires in 10 min). The key saves automatically once approved; check with wallet_info.`)
    } catch (e) {
      return text(`login failed: ${(e as Error).message}`, true)
    }
  },
)

server.registerTool('wallet_info', { description: 'PayCall login status, agent pubkey and amount spent this session.', inputSchema: {} }, async () => {
  const agent = await getAgent().catch(() => undefined)
  if (pending) return text(`login pending: user must enter code ${pending.userCode} at ${pending.verificationUri}${agent ? `\ncurrent key: ${agent.pubkey}` : ''}`)
  return agent ? text(`pubkey: ${agent.pubkey}\nspent this session: ${usd(agent.spent)}`) : text(NOT_LOGGED_IN, true)
})

await server.connect(new StdioServerTransport())
console.error(`paycall-mcp ready, ${(await getAgent().catch(() => undefined))?.pubkey.slice(0, 12) ?? 'not logged in'}`)

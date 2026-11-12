// live smoke: fresh unfunded owner + agent → spawn server over stdio → expect insufficient balance
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { generateKey } from '@paycall-live/sdk'

const API = process.env.PAYCALL_API ?? 'https://api.paycall.live'
async function api(path: string, body: unknown, key?: string) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key && { authorization: `Bearer ${key}` }) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`)
  return res.json() as Promise<any>
}

const k = await generateKey()
const owner = await api('/owners', { email: `mcp-${Date.now()}@example.com` })
const seller = await api('/sellers', { name: 'mcp smoke', paypalEmail: `mcp-seller-${Date.now()}@example.com` })
const ep = await api('/endpoints', { name: 'meteo', upstreamUrl: 'https://api.open-meteo.com/v1/forecast', price: 10000 }, seller.apiKey)
await api('/agents', { pubkey: k.pubkey, name: 'mcp bot' }, owner.apiKey)

const client = new Client({ name: 'smoke', version: '0' })
await client.connect(
  new StdioClientTransport({ command: 'bun', args: ['run', `${import.meta.dir}/../src/index.ts`], env: { ...process.env, PAYCALL_AGENT_KEY: k.privateKey } as Record<string, string> }),
)
const { tools } = await client.listTools()
console.log('tools:', tools.map((t) => t.name))
const wallet: any = await client.callTool({ name: 'wallet_info', arguments: {} })
console.log('wallet_info →', wallet.content[0].text)
const paid: any = await client.callTool({ name: 'paid_fetch', arguments: { url: `${API}/p/${ep.id}?latitude=52.52&longitude=13.41&current=temperature_2m` } })
console.log(`paid_fetch → isError=${paid.isError}`, paid.content[0].text)
await client.close()

const ok = wallet.content[0].text.includes(k.pubkey) && paid.isError && paid.content[0].text.includes('insufficient balance')
console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL')
process.exit(ok ? 0 : 1)

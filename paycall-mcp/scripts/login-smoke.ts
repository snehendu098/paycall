// mcp login tool smoke: needs local worker (PAYCALL_API) + service key to approve
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const { PAYCALL_API: api, SK, KEY_FILE } = process.env as Record<string, string>
const c = new Client({ name: 'smoke', version: '0' })
await c.connect(new StdioClientTransport({ command: 'bun', args: ['run', 'src/index.ts'], env: { ...process.env, PAYCALL_API: api, PAYCALL_KEY_FILE: KEY_FILE } as Record<string, string> }))
const t = async (name: string, args = {}) => ((await c.callTool({ name, arguments: args })).content as { text: string }[])[0]!.text
console.log('1', await t('wallet_info'))
console.log('2', await t('paid_fetch', { url: 'https://example.com' }))
const out = await t('login', { name: 'claude-smoke' }); console.log('3', out)
const code = out.match(/code ([A-Z]{4}-[A-Z]{4})/)![1]
console.log('4', await t('wallet_info'))
await fetch(`${api}/device/${code}/approve`, { method: 'POST', headers: { authorization: `Bearer ${SK}`, 'x-paycall-as': 'owner:own_dev', 'content-type': 'application/json' }, body: '{}' })
await Bun.sleep(3000)
console.log('5', await t('wallet_info'))
await c.close()

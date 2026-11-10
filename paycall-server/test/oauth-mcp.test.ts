// needs local pg: DATABASE_URL, migrations applied
// full hosted-mcp path in-process: dcr → /authorize → consent tx → token → /mcp tools (real voucher payment via /p proxy)
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { agents, channels, endpoints, owners, sellers } from '../src/db/schema'
import worker from '../src/index'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
const upstream = Bun.serve({ port: 0, fetch: (req) => Response.json({ weather: 'sunny', path: new URL(req.url).pathname }) })
afterAll(async () => {
  upstream.stop()
  await close()
})

// ponytail: minimal in-memory kv (get/put/delete/list) for oauth lib + tx store
const store = new Map<string, string>()
const kv = {
  get: async (k: string, t?: string | { type?: string }) => {
    const v = store.get(k)
    return v === undefined ? null : (typeof t === 'string' ? t : t?.type) === 'json' ? JSON.parse(v) : v
  },
  put: async (k: string, v: string) => void store.set(k, v),
  delete: async (k: string) => void store.delete(k),
  list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true, cursor: '' }),
}
const SK = 'svc_test_key'
const O = 'http://localhost'
const env = { HYPERDRIVE: { connectionString }, PAYCALL_SERVICE_KEY: SK, DASHBOARD_ORIGIN: 'http://dash.test', KV: kv, OAUTH_KV: kv } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const req = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`${O}${path}`, init), env, ctx)
const svc = (path: string, body?: unknown) =>
  req(path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${SK}`, 'x-paycall-as': 'owner:own_1', 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const REDIRECT = 'http://localhost:9999/callback'
async function startAuth(redirect = REDIRECT) {
  const reg = await req('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: [redirect], client_name: 'Claude Code', token_endpoint_auth_method: 'none' }) })
  const { client_id } = (await reg.json()) as { client_id: string }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const q = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: redirect, scope: 'mcp offline_access', state: 'st', code_challenge: challenge, code_challenge_method: 'S256', resource: `${O}/mcp` })
  const res = await req(`/authorize?${q}`, { redirect: 'manual' })
  return { res, client_id, verifier, tx: new URL(res.headers.get('location') ?? 'http://x/').searchParams.get('tx') }
}
async function token(client_id: string, verifier: string, redirectTo: string) {
  const code = new URL(redirectTo).searchParams.get('code')!
  const r = await req('/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT, client_id, resource: `${O}/mcp` }),
  })
  return ((await r.json()) as { access_token: string }).access_token
}
let rpcId = 0
async function tool(at: string, name: string, args: Record<string, unknown> = {}) {
  const r = await req('/mcp', {
    method: 'POST',
    headers: { host: 'localhost', authorization: `Bearer ${at}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, // workerd sets host, bun doesn't
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  })
  const raw = await r.text()
  const json = raw.startsWith('{') ? raw : raw.split('\n').find((l) => l.startsWith('data:'))!.slice(5) // sse or json
  return (JSON.parse(json) as { result: { content: { text: string }[]; isError?: boolean } }).result
}

beforeEach(async () => {
  store.clear()
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.insert(owners).values({ id: 'own_1', email: 'o@x.io', apiKeyHash: 'h1', balance: 25_000, dailyCap: 1_000_000 })
  await db.insert(sellers).values({ id: 'sel_1', name: 'Wx', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
  await db.insert(endpoints).values({ id: 'ep_1', sellerId: 'sel_1', name: 'wx', upstreamUrl: `http://localhost:${upstream.port}`, price: 10_000 })
})

test('oauth → consent → token → paid_fetch pays proxy via voucher; wallet_info', async () => {
  const s = await startAuth()
  expect(s.res.status).toBe(302)
  expect(s.res.headers.get('location')).toStartWith('http://dash.test/app/authorize?tx=')

  const info = (await (await svc(`/oauth/tx/${s.tx}`)).json()) as { clientName: string; redirectHost: string }
  expect(info).toMatchObject({ clientName: 'Claude Code', redirectHost: 'localhost:9999' })

  const done = await svc(`/oauth/tx/${s.tx}/complete`, { name: 'claude-code', maxPrice: 50_000 })
  const { redirectTo } = (await done.json()) as { redirectTo: string }
  expect(redirectTo).toStartWith(REDIRECT)
  expect((await svc(`/oauth/tx/${s.tx}/complete`, { name: 'x' })).status).toBe(404) // single use

  const [a] = await db.select().from(agents)
  expect(a).toMatchObject({ ownerId: 'own_1', name: 'claude-code', maxPrice: 50_000 })
  expect(JSON.stringify([...store.values()])).not.toContain('privateKey') // only encrypted props in kv

  const at = await token(s.client_id, s.verifier, redirectTo)
  expect(at).toBeTruthy()
  expect((await req('/mcp', { method: 'POST' })).status).toBe(401) // no token

  const r1 = await tool(at, 'paid_fetch', { url: `${O}/p/ep_1/today` })
  expect(r1.isError).toBeFalsy()
  expect(r1.content[0].text).toContain('HTTP 200')
  expect(r1.content[0].text).toContain('paid $0.01')
  expect(r1.content[0].text).toContain('sunny')
  await tool(at, 'paid_fetch', { url: `${O}/p/ep_1/today` }) // seq 2, fresh agent per request → /channels lookup
  const [ch] = await db.select().from(channels)
  expect(ch).toMatchObject({ agentPubkey: a!.pubkey, sellerId: 'sel_1', seq: 2, cumulative: 20_000 })
  expect((await db.select().from(owners).where(eq(owners.id, 'own_1')))[0]!.balance).toBe(5_000)

  const r3 = await tool(at, 'paid_fetch', { url: `${O}/p/ep_1/today` })
  expect(r3.isError).toBe(true)
  expect(r3.content[0].text).toContain('insufficient balance')

  const sr = await tool(at, 'search_paid_apis', { query: 'wx' })
  expect(sr.content[0].text).toContain(`${O}/p/ep_1`)
  expect(sr.content[0].text).toContain('$0.01/call')

  const w = await tool(at, 'wallet_info')
  expect(w.content[0].text).toContain('balance: $0.01')
  expect(w.content[0].text).toContain('spent today: $0.02')
})

test('deny → access_denied; foreign redirect host rejected; expired tx 404', async () => {
  const s = await startAuth()
  const { redirectTo } = (await (await svc(`/oauth/tx/${s.tx}/deny`, {})).json()) as { redirectTo: string }
  expect(new URL(redirectTo).searchParams.get('error')).toBe('access_denied')
  expect((await svc(`/oauth/tx/${s.tx}`)).status).toBe(404)

  for (const bad of ['https://evil.example/cb', 'http://chatgpt.com/cb', 'https://claude.ai.evil.example/cb', 'javascript://x', 'evilapp://cb'])
    expect((await startAuth(bad)).res.status).toBe(400)
  for (const good of ['cursor://anysphere.cursor-mcp/oauth/callback', 'https://chatgpt.com/connector_platform_oauth_redirect', 'https://vscode.dev/redirect', 'http://127.0.0.1:33418/'])
    expect((await startAuth(good)).res.status).toBe(302)
  expect((await svc('/oauth/tx/nope')).status).toBe(404)
})

// needs local pg: DATABASE_URL, migrations applied
// hosted listings (self-hosted middleware): create + probe, catalog, proxy 404, manifest import
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { connect } from '../src/db'
import { sellers } from '../src/db/schema'
import worker from '../src/index'
import { SCHEME } from '../src/payments'

const connectionString = process.env.DATABASE_URL!
const { db, close } = await connect(connectionString)
// stub seller server: 402 like @paycall-live/middleware
const pr = (payTo: string) => ({ 'PAYMENT-REQUIRED': btoa(JSON.stringify({ x402Version: 2, accepts: [{ scheme: SCHEME, payTo, amount: '10000' }] })) })
const seen: string[] = []
const stub = Bun.serve({
  port: 0,
  fetch: (r) => {
    const u = new URL(r.url)
    seen.push(`${r.method} ${u.pathname} ${r.headers.get('authorization') ?? ''}`)
    if (u.pathname === '/free') return Response.json({ free: true })
    if (u.pathname === '/moved') return Response.redirect('https://evil.test/', 302)
    return new Response('pay', { status: 402, headers: pr(u.pathname === '/wrong' ? 'sel_other' : 'sel_1') })
  },
})
// https://seller.test → stub (validator is https-only)
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const r = new Request(input, init)
  return r.url.startsWith('https://seller.test') ? realFetch(r.url.replace('https://seller.test', `http://localhost:${stub.port}`), init) : realFetch(input, init)
}) as typeof fetch
afterAll(async () => {
  globalThis.fetch = realFetch
  stub.stop()
  await close()
})

const SK = 'svc_test_key'
const env = { HYPERDRIVE: { connectionString }, KV: { get: async () => null, put: async () => {} }, PAYCALL_SERVICE_KEY: SK, BETTER_AUTH_SECRET: 'test-secret' } as unknown as CloudflareBindings
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext
const fetchW = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://localhost${path}`, init), env, ctx)
const seller = (method: string, path: string, body?: unknown) =>
  fetchW(path, { method, headers: { authorization: `Bearer ${SK}`, 'x-paycall-as': 'seller:sel_1', 'content-type': 'application/json' }, body: body && JSON.stringify(body) })

type Ep = { id: string; mode: string; price: number; routes: { path: string; probe: { ok: boolean; error?: string } }[] }
const hosted = {
  mode: 'hosted',
  name: 'wx',
  baseUrl: 'https://seller.test/',
  docs: '# Weather\n\nCall `/ok`.',
  routes: [
    { method: 'GET', path: '/ok', price: 10_000, description: 'paid' },
    { method: 'POST', path: '/items/:id', price: 5_000, example: '/items/42' },
    { method: 'GET', path: '/items/:id/raw', price: 20_000 },
    { method: 'GET', path: '/wrong', price: 10_000 },
    { method: 'GET', path: '/free', price: 10_000 },
    { method: 'GET', path: '/moved', price: 10_000 },
  ],
}

beforeEach(async () => {
  seen.length = 0
  await db.execute(sql`truncate owners, agents, sellers, channels, entries, endpoints, approvals cascade`)
  await db.insert(sellers).values({ id: 'sel_1', name: 'WeatherCo', paypalEmail: 's@x.io', apiKeyHash: 'h2' })
})

test('hosted create probes each route; only ok routes in catalog + detail', async () => {
  const res = await seller('POST', '/endpoints', hosted)
  expect(res.status).toBe(201)
  const ep = (await res.json()) as Ep
  expect(ep.mode).toBe('hosted')
  expect(ep.price).toBe(5_000) // cheapest route
  expect(ep.routes.map((r) => [r.path, r.probe.ok, r.probe.error])).toEqual([
    ['/ok', true, undefined],
    ['/items/:id', true, undefined],
    ['/items/:id/raw', false, 'needs_example'],
    ['/wrong', false, 'payTo is not your seller id (wrong API key?)'],
    ['/free', false, 'expected 402, got 200'],
    ['/moved', false, 'expected 402, got 302'],
  ])
  expect(seen).toContain('POST /items/42 ') // example used, method kept, no auth sent
  expect(seen.every((s) => s.endsWith(' '))).toBe(true)

  const [l] = (await (await fetchW('/catalog?q=wx')).json()) as { url: string; routes: { url: string; method: string }[] }[]
  expect(l!.url).toBe('https://seller.test')
  expect(l!.routes.map((r) => `${r.method} ${r.url}`)).toEqual(['GET https://seller.test/ok', 'POST https://seller.test/items/:id'])
  const d = (await (await fetchW(`/catalog/${ep.id}`)).json()) as { docs: string }
  expect(d.docs).toBe(hosted.docs)

  // /p never proxies hosted listings
  expect((await fetchW(`/p/${ep.id}/ok`)).status).toBe(404)
})

test('hosted with no ok route is hidden; re-check after fix lists it', async () => {
  const ep = (await (await seller('POST', '/endpoints', { ...hosted, routes: [{ method: 'GET', path: '/wrong', price: 1 }] })).json()) as Ep
  expect(await (await fetchW('/catalog')).json()).toEqual([])
  expect((await fetchW(`/catalog/${ep.id}`)).status).toBe(404)
  const up = (await (await seller('PATCH', `/endpoints/${ep.id}`, { routes: [{ method: 'GET', path: '/ok', price: 1 }] })).json()) as Ep
  expect(up.routes[0]!.probe.ok).toBe(true)
  expect(await (await fetchW('/catalog')).json()).toHaveLength(1)
  const re = await seller('POST', `/endpoints/${ep.id}/probe`)
  expect(((await re.json()) as Ep).routes[0]!.probe.ok).toBe(true)
})

test('validation: https only, path shape, max routes, docs size, clear messages', async () => {
  const bad = async (b: unknown) => {
    const r = await seller('POST', '/endpoints', b)
    expect(r.status).toBe(400)
    return ((await r.json()) as { error: string }).error
  }
  expect(await bad({ ...hosted, baseUrl: 'http://seller.test' })).toContain('baseUrl')
  expect(await bad({ ...hosted, routes: [{ path: '//evil.test', price: 1 }] })).toContain('routes.0.path')
  expect(await bad({ ...hosted, routes: Array.from({ length: 51 }, () => ({ path: '/ok', price: 1 })) })).toContain('max 50 routes')
  expect(await bad({ ...hosted, docs: 'x'.repeat(20_001) })).toContain('docs')
  // proxy default unchanged; proxy recheck rejected
  const p = await seller('POST', '/endpoints', { name: 'px', upstreamUrl: 'https://seller.test/api', price: 100 })
  expect(p.status).toBe(201)
  const pe = (await p.json()) as Ep
  expect(pe.mode).toBe('proxy')
  expect((await seller('POST', `/endpoints/${pe.id}/probe`)).status).toBe(400)
})

test('manifest import: dollar strings → validated create body, nothing saved', async () => {
  const r = await seller('POST', '/endpoints/import', { mode: 'hosted', name: 'wx', baseUrl: 'https://seller.test', routes: [{ path: '/ok', price: '0.005', pricing: 'token', maxAmount: '0.05' }] })
  expect(r.status).toBe(200)
  expect(await r.json()).toMatchObject({ mode: 'hosted', baseUrl: 'https://seller.test', routes: [{ method: 'GET', path: '/ok', price: 5_000, pricing: 'token', maxAmount: 50_000 }] })
  const proxy = await seller('POST', '/endpoints/import', { name: 'px', upstreamUrl: 'https://seller.test', price: '0.01' })
  expect(await proxy.json()).toMatchObject({ mode: 'proxy', price: 10_000, upstreamUrl: 'https://seller.test' })
  const bad = await seller('POST', '/endpoints/import', { mode: 'hosted', name: 'wx', baseUrl: 'https://seller.test', routes: [{ path: '/ok', price: 0.005 }] })
  expect(bad.status).toBe(400)
  expect(((await bad.json()) as { error: string }).error).toContain('routes.0.price: dollars as a string')
  expect(await (await seller('GET', '/endpoints')).json()).toEqual([])
})

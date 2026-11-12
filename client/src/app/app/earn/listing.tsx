'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { XIcon } from '@phosphor-icons/react'
import { ago, dur, toDollars, toMicros, type Pricing, type Route } from '@/lib/api'
import { pc } from '@/lib/pc'
import { Code, Input } from '@/components/ds'
import { Md } from '@/components/md'
import { act, Act, errMsg, Field, Page } from '@/components/portal'
import { cn } from '@/lib/utils'
import { HeaderFields, MODES, PASSES, PRICE, PricingFields, readHeaders, readPricing, type Endpoint, type Errs } from './endpoints'

type Mode = Endpoint['mode']
type Draft = { method: string; path: string; price: string; pricing: Pricing['pricing']; maxAmount: string; passSeconds: number; description: string; example: string; probe?: Route['probe'] }
/** Prefill for uncontrolled fields; remounted (key) on import. */
type Init = { name?: string; description?: string | null; category?: string | null; upstreamUrl?: string; baseUrl?: string; pricing?: Pricing; headers?: Record<string, string> }
type Imported = { mode: Mode; name: string; description?: string; category?: string; docs?: string; upstreamUrl?: string; baseUrl?: string; price?: number; pricing?: Pricing['pricing']; maxAmount?: number | null; passSeconds?: number | null; upstreamHeaders?: Record<string, string>; routes?: Route[] }

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const DOCS_MAX = 20_000
const blank: Draft = { method: 'GET', path: '', price: '0.01', pricing: 'call', maxAmount: '0.05', passSeconds: 86_400, description: '', example: '' }
const toDraft = (r: Route): Draft => ({ ...blank, ...r, price: toDollars(r.price), maxAmount: r.maxAmount ? toDollars(r.maxAmount) : blank.maxAmount, passSeconds: r.passSeconds ?? blank.passSeconds, example: r.example ?? '' })
const metered = (p: string) => p === 'token' || p === 'char'
const fromDraft = (d: Draft) => ({
  method: d.method,
  path: d.path.trim(),
  price: toMicros(d.price),
  pricing: d.pricing,
  ...(metered(d.pricing) && { maxAmount: toMicros(d.maxAmount) }),
  ...(d.pricing === 'pass' && { passSeconds: d.passSeconds }),
  description: d.description.trim(),
  ...(d.example.trim() && { example: d.example.trim() }),
})
const routeErr = (d: Draft) =>
  !/^\/\S*$/.test(d.path.trim()) ? 'Path starts with /, no spaces'
    : !PRICE.test(d.price.trim()) || toMicros(d.price) < 1 ? 'Price: dollars > 0'
      : metered(d.pricing) && (!PRICE.test(d.maxAmount.trim()) || toMicros(d.maxAmount) < toMicros(d.price)) ? 'Max per call: at least the price'
        : d.example && !/^\/\S*$/.test(d.example.trim()) ? 'Example: a real path like /items/42' : undefined
const isHttps = (u: string) => { try { return new URL(u).protocol === 'https:' } catch { return false } }
const sel = 'h-9 w-full border border-input bg-card px-2 text-[13px] outline-none transition-colors hover:border-foreground/30 focus-visible:border-foreground'
const cell = 'h-9 font-mono text-xs md:text-xs'
const textarea = 'w-full resize-y border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground'

export const MANIFEST = `{
  "mode": "hosted",
  "name": "Acme Weather",
  "category": "weather",
  "description": "Forecasts and alerts by city",
  "baseUrl": "https://api.acme.dev",
  "routes": [
    { "method": "GET", "path": "/forecast", "price": "0.005", "description": "7 day forecast, ?city=" },
    { "method": "GET", "path": "/alerts/:region", "price": "0.01", "example": "/alerts/us-ca" },
    { "method": "POST", "path": "/summarize", "price": "0.00002", "pricing": "token", "maxAmount": "0.05" }
  ]
}`

/** Read picked files as text. */
const read = (files: FileList | null) => Promise.all([...(files ?? [])].map(async (f) => ({ name: f.name, text: await f.text() })))

function Section({ n, title, aside, children }: { n: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-border pt-6">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm text-muted-foreground"><span className="mr-2 font-mono text-[11px] text-muted-foreground/60">{n}</span>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Seg<T extends string>({ value, onChange, opts, disabled, label }: { value: T; onChange: (v: T) => void; opts: { k: T; label: string; sub?: string }[]; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-px border border-border bg-border', opts.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
      {opts.map((o) => (
        <button key={o.k} type="button" role="radio" aria-checked={value === o.k} disabled={disabled && value !== o.k} onClick={() => onChange(o.k)} className={cn('flex flex-col gap-0.5 bg-card px-3 py-2.5 text-left transition-colors disabled:opacity-40', value === o.k ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          <span className="text-[13px]">{o.label}</span>
          {o.sub && <span className="text-xs text-muted-foreground">{o.sub}</span>}
        </button>
      ))}
    </div>
  )
}

const Cell = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <label className={cn('flex min-w-0 flex-col gap-1', className)}>
    <span className="text-[11px] text-muted-foreground">{label}</span>
    {children}
  </label>
)

function ProbeLine({ p }: { p?: Route['probe'] }) {
  if (!p) return <span className="text-xs text-muted-foreground/70">Checked on save</span>
  if (p.ok) return <span className="text-xs text-live" suppressHydrationWarning>● Live · answers 402 · checked {ago(p.checkedAt)}</span>
  const why = p.error === 'needs_example' ? 'Add an example path so PayCall can check it' : p.error
  return <span className="text-xs text-destructive">✕ Not listed: {why}</span>
}

function RouteRow({ d, i, set, remove }: { d: Draft; i: number; set: (d: Partial<Draft>) => void; remove?: () => void }) {
  const err = d.path || d.description ? routeErr(d) : undefined
  const money = (k: 'price' | 'maxAmount', label: string) => (
    <Cell label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">$</span>
        <Input value={d[k]} onChange={(e) => set({ [k]: e.target.value })} inputMode="decimal" className={`${cell} pl-6`} />
      </div>
    </Cell>
  )
  return (
    <li data-testid="route" className="flex flex-col gap-3 border border-border p-3 sm:p-4">
      <div className="flex items-end gap-2">
        <Cell label="Method" className="w-[92px] shrink-0">
          <select value={d.method} onChange={(e) => set({ method: e.target.value })} className={cn(sel, 'font-mono text-xs')}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </Cell>
        <Cell label={`Route ${i + 1} path`} className="flex-1">
          <Input value={d.path} onChange={(e) => set({ path: e.target.value })} placeholder="/forecast" spellCheck={false} className={cell} />
        </Cell>
        {remove && (
          <button type="button" aria-label={`Remove route ${i + 1}`} onClick={remove} className="grid size-9 shrink-0 place-items-center border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Pricing">
          <select value={d.pricing} onChange={(e) => set({ pricing: e.target.value as Draft['pricing'] })} className={sel}>{MODES.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}</select>
        </Cell>
        {money('price', d.pricing === 'call' ? 'Price' : d.pricing === 'pass' ? 'Per pass' : `Per ${d.pricing}`)}
        {metered(d.pricing) && money('maxAmount', 'Max per call')}
        {d.pricing === 'pass' && (
          <Cell label="Pass lasts">
            <select value={d.passSeconds} onChange={(e) => set({ passSeconds: Number(e.target.value) })} className={sel}>
              {PASSES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
              {!PASSES.some(([s]) => s === d.passSeconds) && <option value={d.passSeconds}>{dur(d.passSeconds)}</option>}
            </select>
          </Cell>
        )}
        <Cell label={d.path.includes('/:') ? 'Example path (for the check)' : 'Example path'} className={cn(d.pricing === 'call' ? 'col-span-2' : 'col-span-2 sm:col-span-1')}>
          <Input value={d.example} onChange={(e) => set({ example: e.target.value })} placeholder={d.path.includes('/:') ? d.path.replace(/:[^/]+/g, '42') : 'optional'} spellCheck={false} className={cell} />
        </Cell>
      </div>
      <Cell label="What it does">
        <Input value={d.description} onChange={(e) => set({ description: e.target.value })} maxLength={300} placeholder="7 day forecast for ?city=" className="h-9 text-[13px] md:text-[13px]" />
      </Cell>
      {err ? <span className="text-xs text-destructive">{err}</span> : <ProbeLine p={d.probe} />}
    </li>
  )
}

function Docs({ docs, setDocs }: { docs: string; setDocs: (s: string) => void }) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const file = useRef<HTMLInputElement>(null)
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const [f] = await read(e.target.files)
    e.target.value = ''
    if (!f) return
    if (f.text.length > DOCS_MAX) return toast.error(`${f.name} is over ${DOCS_MAX.toLocaleString()} characters`)
    setDocs(f.text)
    setTab('write')
  }
  const tabCls = (on: boolean) => cn('h-9 px-4 text-[13px] transition-colors', on ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Docs editor" className="flex border border-border">
          <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')} className={tabCls(tab === 'write')}>Write</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')} className={tabCls(tab === 'preview')}>Preview</button>
        </div>
        <input ref={file} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={upload} />
        <button type="button" onClick={() => file.current?.click()} className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground">Upload .md</button>
      </div>
      {tab === 'write' ? (
        <textarea aria-label="Docs (markdown)" value={docs} onChange={(e) => setDocs(e.target.value)} maxLength={DOCS_MAX} rows={14} spellCheck={false} placeholder={'# Acme Weather\n\nAuth: none, pay per call.\n\n## GET /forecast?city=\n\nReturns a 7 day forecast…'} className={cn(textarea, 'font-mono text-[13px] leading-6')} />
      ) : (
        <div data-testid="docs-preview" className="min-h-[200px] border border-border bg-card/40 px-4 py-4 sm:px-6 sm:py-5"><Md>{docs}</Md></div>
      )}
      <span className="text-xs text-muted-foreground/80">Markdown, shown on your catalog page and to agents via <span className="font-mono">get_api_docs</span>. {docs.length.toLocaleString()} / {DOCS_MAX.toLocaleString()}</span>
    </div>
  )
}

/** Create (no ep) or edit a listing. Mode fixed after create. */
export function ListingForm({ ep }: { ep?: Endpoint }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(ep?.mode ?? 'proxy')
  const [init, setInit] = useState<Init>(ep ? { ...ep, baseUrl: ep.upstreamUrl, pricing: ep } : {})
  const [key, setKey] = useState(0)
  const [routes, setRoutes] = useState<Draft[]>(ep?.routes?.map(toDraft) ?? [{ ...blank }])
  const [docs, setDocs] = useState(ep?.docs ?? '')
  const [errs, setErrs] = useState<Errs & { baseUrl?: string; routes?: string }>({})
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const files = useRef<HTMLInputElement>(null)
  const putRoute = (i: number, d: Partial<Draft>) => setRoutes((rs) => rs.map((r, j) => (j === i ? { ...r, ...d, probe: undefined } : r)))

  async function importFiles(e: ChangeEvent<HTMLInputElement>) {
    const fs = await read(e.target.files)
    e.target.value = ''
    const md = fs.find((f) => /\.(md|markdown)$/i.test(f.name))
    const json = fs.find((f) => /\.json$/i.test(f.name))
    if (!json && !md) return toast.error('Pick a paycall.json and/or README.md')
    if (md && md.text.length > DOCS_MAX) return toast.error(`${md.name} is over ${DOCS_MAX.toLocaleString()} characters`)
    if (json) {
      let raw: unknown
      try {
        raw = JSON.parse(json.text)
      } catch {
        return setErrs({ form: `${json.name}: not valid JSON` })
      }
      let b: Imported
      try {
        b = await pc<Imported>('seller', 'endpoints/import', { body: raw })
      } catch (x) {
        return setErrs({ form: `${json.name}: ${errMsg(x)}` })
      }
      if (ep && b.mode !== ep.mode) return setErrs({ form: `${json.name} is a ${b.mode} listing; this one is ${ep.mode}` })
      setMode(b.mode)
      setInit({ name: b.name, description: b.description, category: b.category, upstreamUrl: b.upstreamUrl, baseUrl: b.baseUrl, headers: b.upstreamHeaders, pricing: b.price ? { price: b.price, pricing: b.pricing ?? 'call', maxAmount: b.maxAmount ?? null, passSeconds: b.passSeconds ?? null } : undefined })
      if (b.routes) setRoutes(b.routes.map(toDraft))
      if (b.docs && !md) setDocs(b.docs)
      setKey((k) => k + 1)
    }
    if (md) setDocs(md.text)
    setErrs({})
    toast.success(`Imported ${fs.map((f) => f.name).join(' + ')}`, { description: 'Review, then save.' })
  }

  async function recheck() {
    setChecking(true)
    try {
      const r = await pc<Endpoint>('seller', `endpoints/${ep!.id}/probe`, { method: 'POST' })
      setRoutes(r.routes?.map(toDraft) ?? [])
      const live = r.routes?.filter((x) => x.probe?.ok).length ?? 0
      toast[live ? 'success' : 'error'](`${live}/${r.routes?.length ?? 0} routes live`)
    } catch (x) {
      toast.error("Couldn't re-check", { description: errMsg(x) })
    } finally {
      setChecking(false)
    }
  }

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const name = s('name')
    const meta = { name, description: s('description'), category: s('category'), docs }
    const v: typeof errs = { name: !name ? 'Name it' : undefined }
    let body: object
    if (mode === 'proxy') {
      const upstreamUrl = s('upstreamUrl'), p = readPricing(f), h = readHeaders(f)
      Object.assign(v, { upstreamUrl: !ep && !isHttps(upstreamUrl) ? 'Must be a full https:// URL' : undefined, ...p.errs, upstreamHeaders: h.error })
      const clear = f.get('clearHeaders') === '1'
      body = ep ? { ...meta, ...p.body, ...(h.headers ? { upstreamHeaders: h.headers } : clear && { upstreamHeaders: null }) } : { mode, ...meta, upstreamUrl, ...p.body, upstreamHeaders: h.headers }
    } else {
      const baseUrl = s('baseUrl'), bad = routes.map(routeErr).findIndex(Boolean)
      Object.assign(v, { baseUrl: !isHttps(baseUrl) ? 'Must be a full https:// URL' : undefined, routes: !routes.length ? 'Add at least one route' : bad >= 0 ? `Route ${bad + 1}: ${routeErr(routes[bad]!)}` : undefined })
      body = { ...(!ep && { mode }), ...meta, baseUrl, routes: routes.map(fromDraft) }
    }
    setErrs(v)
    if (Object.values(v).some(Boolean)) return
    setBusy(true)
    try {
      const r = await pc<Endpoint>('seller', ep ? `endpoints/${ep.id}` : 'endpoints', { method: ep ? 'PATCH' : 'POST', body })
      if (r.mode === 'proxy') {
        toast.success(ep ? `${name} updated` : `${name} is live`)
        return router.push('/app/earn')
      }
      const live = r.routes?.filter((x) => x.probe?.ok).length ?? 0
      toast[live ? 'success' : 'error'](`${name} saved · ${live}/${r.routes?.length ?? 0} routes live`, { description: live ? 'Live routes show in the catalog.' : 'No route passed the check yet, see below.' })
      setRoutes(r.routes?.map(toDraft) ?? [])
      if (!ep) router.replace(`/app/earn/${r.id}/edit`)
    } catch (x) {
      setErrs({ form: errMsg(x) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page className="max-w-[760px] gap-10 md:gap-12">
      <section className="flex flex-col gap-4">
        <Link href="/app/earn" className="self-start text-[13px] text-muted-foreground transition-colors hover:text-foreground">← Earn</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[40px] font-light leading-tight tracking-[-0.03em] md:text-5xl">{ep ? ep.name : 'New listing'}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{ep ? 'Edit your listing. Self-hosted routes are re-checked on save.' : 'Put a price on your API. Agents find it in the catalog and pay per call.'}</p>
          </div>
          <input ref={files} type="file" accept=".json,.md,.markdown,application/json,text/markdown" multiple hidden onChange={importFiles} />
          <Act onClick={() => files.current?.click()}>Import from files</Act>
        </div>
        <details className="group border border-border bg-card/40 text-[13px]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-muted-foreground transition-colors hover:text-foreground">
            <span>Manifest format: <span className="font-mono text-foreground">paycall.json</span> + optional <span className="font-mono text-foreground">README.md</span></span>
            <span className="font-mono text-xs transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 text-muted-foreground">
            <p>One listing per file. Same fields as the form; prices are dollar strings. <span className="font-mono text-foreground">mode</span>: <span className="font-mono text-foreground">hosted</span> (base URL + routes) or <span className="font-mono text-foreground">proxy</span> (<span className="font-mono text-foreground">upstreamUrl</span>, <span className="font-mono text-foreground">price</span>, <span className="font-mono text-foreground">pricing</span>). README.md becomes the docs. Nothing is saved until you press save.</p>
            <Code text={MANIFEST} className="[&_pre]:text-[12px]" />
          </div>
        </details>
      </section>

      <form key={key} onSubmit={submit} noValidate className="flex flex-col gap-10">
        <Section n="01" title="Basics">
          <Field label="Name" id="l-name" error={errs.name}>
            <Input id="l-name" name="name" defaultValue={init.name} placeholder="Acme Weather" maxLength={64} aria-invalid={!!errs.name} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
            <Field label="Summary" id="l-desc" hint="One or two lines on catalog cards. Agents search this.">
              <textarea id="l-desc" name="description" maxLength={500} rows={2} defaultValue={init.description ?? ''} placeholder="Forecasts and alerts by city" className={textarea} />
            </Field>
            <Field label="Category" id="l-cat" hint="e.g. weather, search, llm">
              <Input id="l-cat" name="category" maxLength={32} defaultValue={init.category ?? ''} placeholder="weather" />
            </Field>
          </div>
        </Section>

        <Section n="02" title="How agents reach it">
          <Seg
            label="Listing mode"
            value={mode}
            onChange={setMode}
            disabled={!!ep}
            opts={[
              { k: 'proxy', label: 'Proxy', sub: 'PayCall forwards to one URL, one price' },
              { k: 'hosted', label: 'Self-hosted', sub: 'Your server runs the middleware' },
            ]}
          />
          {mode === 'proxy' ? (
            <>
              <Field label="Upstream URL" id="l-url" error={errs.upstreamUrl} hint={ep ? 'Fixed after create.' : 'Your API, as is. HTTPS only. Every subpath, one price.'}>
                <Input id="l-url" name="upstreamUrl" type="url" defaultValue={init.upstreamUrl} disabled={!!ep} placeholder="https://api.example.com/v1" className="font-mono" aria-invalid={!!errs.upstreamUrl} />
              </Field>
              <PricingFields id="l" d={init.pricing} errs={errs} />
              <HeaderFields set={ep?.hasAuth} init={init.headers} error={errs.upstreamHeaders} />
            </>
          ) : (
            <>
              <Field label="Base URL" id="l-base" error={errs.baseUrl} hint={<>Agents call this + route path directly. Protect each route with <span className="font-mono">@paycall-live/middleware</span> and your seller key.</>}>
                <Input id="l-base" name="baseUrl" type="url" defaultValue={init.baseUrl} placeholder="https://api.acme.dev" className="font-mono" aria-invalid={!!errs.baseUrl} />
              </Field>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[13px] text-muted-foreground">Routes <span className="font-mono text-xs text-muted-foreground/60">{routes.length}/50</span></span>
                  {ep && <button type="button" onClick={recheck} disabled={checking} className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground disabled:opacity-40">{checking ? 'Checking…' : 'Re-check saved routes'}</button>}
                </div>
                <ul className="flex flex-col gap-3">
                  {routes.map((d, i) => <RouteRow key={i} d={d} i={i} set={(x) => putRoute(i, x)} remove={routes.length > 1 ? () => setRoutes((rs) => rs.filter((_, j) => j !== i)) : undefined} />)}
                </ul>
                <button type="button" disabled={routes.length >= 50} onClick={() => setRoutes((rs) => [...rs, { ...blank }])} className="self-start text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground disabled:opacity-40">+ Add route</button>
                {errs.routes ? <span className="text-xs text-destructive">{errs.routes}</span> : (
                  <span className="text-xs text-muted-foreground/80">On save PayCall calls each route without paying and expects a 402 from your middleware. Only passing routes are listed; free routes aren&apos;t.</span>
                )}
              </div>
            </>
          )}
        </Section>

        <Section n="03" title="Docs">
          <Docs docs={docs} setDocs={setDocs} />
        </Section>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          {errs.form ? <p role="alert" className="text-xs text-destructive">{errs.form}</p> : <span className="text-xs text-muted-foreground/80">{mode === 'proxy' ? 'Paid URL appears right after save.' : 'Probe results appear per route after save.'}</span>}
          <div className="flex justify-end gap-3">
            <Link href="/app/earn" className={act()}>Cancel</Link>
            <Act primary type="submit" disabled={busy}>{busy ? 'Saving…' : ep ? 'Save' : 'Create listing'}</Act>
          </div>
        </div>
      </form>
    </Page>
  )
}

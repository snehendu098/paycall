'use client'

import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { $, API, dur, per, toDollars, toMicros, type Pricing, type Route } from '@/lib/api'
import { pc } from '@/lib/pc'
import { XIcon } from '@phosphor-icons/react'
import { Code, Input, Select } from '@/components/ds'
import { Act, CopyChip, ease, errMsg, Field, Nothing, PDialog, Skel, Verified } from '@/components/portal'
import { cn } from '@/lib/utils'

/** Seller's own listing. hosted: upstreamUrl = base url agents call, routes probed by PayCall. */
export type Endpoint = Pricing & { id: string; name: string; mode: 'proxy' | 'hosted'; upstreamUrl: string; description: string | null; category: string | null; docs: string; routes: Route[] | null; hasAuth: boolean; verified: boolean; createdAt: string }

export const PRICE = /^\d+(\.\d{1,6})?$/
const HNAME = /^[A-Za-z0-9-]{1,64}$/
type Row = { k: string; v: string }
/** HeaderFields rows (hidden json input) → {header: value}; blank rows skipped. */
export function readHeaders(f: FormData): { headers?: Record<string, string>; error?: string } {
  const rows = (JSON.parse(String(f.get('upstreamHeaders') ?? '[]')) as Row[]).map((r) => ({ k: r.k.trim(), v: r.v.trim() })).filter((r) => r.k || r.v)
  if (!rows.length) return {}
  if (rows.some((r) => !HNAME.test(r.k))) return { error: 'Header names: letters, digits and - only' }
  if (rows.some((r) => !r.v)) return { error: 'Every header needs a value' }
  return { headers: Object.fromEntries(rows.map((r) => [r.k, r.v])) }
}
const proxyUrl = (id: string) => `${API}/p/${id}`

/** Endpoint rows. */
export function EndpointList({ list, reload }: { list?: Endpoint[]; reload: () => void }) {
  if (!list) return <div className="flex flex-col gap-3 border-t border-border pt-4"><Skel className="h-24" /></div>
  if (list.length === 0) return <Nothing>No listings yet. Proxy any HTTPS API, or list routes on your own server.</Nothing>
  return (
    <ul className="border-t border-border">
      <AnimatePresence initial={false}>
        {list.map((e) => (
          <motion.li key={e.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }} className="border-b border-border py-5 last:border-b-0">
            <EndpointRow e={e} reload={reload} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

const link = 'text-[13px] text-muted-foreground transition-colors hover:text-foreground'

function EndpointRow({ e, reload }: { e: Endpoint; reload: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [tryIt, setTryIt] = useState(false)
  const [busy, setBusy] = useState(false)
  const hosted = e.mode === 'hosted'
  const n = e.routes?.length ?? 0
  const live = (e.routes ?? []).filter((r) => r.probe?.ok)
  const first = live[0]
  const url = hosted ? e.upstreamUrl : proxyUrl(e.id)

  async function del() {
    setBusy(true)
    try {
      await pc('seller', `endpoints/${e.id}`, { method: 'DELETE' })
      toast.success(`${e.name} deleted`)
      setConfirm(false)
      reload()
    } catch (err) {
      toast.error("Couldn't delete endpoint", { description: errMsg(err) })
    } finally {
      setBusy(false)
    }
  }

  const code = '[&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:py-2.5 [&_pre]:text-[12px]'
  const host = new URL(e.upstreamUrl).host // server validates https url
  const meta = [
    e.category && (e.category.length <= 3 ? e.category.toUpperCase() : e.category[0]!.toUpperCase() + e.category.slice(1)),
    hosted ? `Self-hosted on ${host}` : `Forwards to ${host}`,
    hosted && `${live.length}/${n} ${n === 1 ? 'route' : 'routes'} live`,
    e.hasAuth && 'API key added',
  ].filter(Boolean) as string[]
  return (
    <div data-testid="endpoint" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px]">{e.name}</span>
          {e.verified && <Verified />}
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums">{hosted && <span className="text-muted-foreground">from </span>}{$(e.price)}<span className="text-muted-foreground">{per(e)}</span></span>
      </div>
      {e.description && <p className="line-clamp-2 max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">{e.description}</p>}
      <div className="text-xs text-muted-foreground/80" title={e.upstreamUrl}>
        {meta.join(' · ')}
        {live.length < n && <span className="text-destructive"> · {n - live.length} failing check</span>}
      </div>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CopyChip text={url} label={url.replace(/^https?:\/\//, '')} className="self-start" />
        <div className="flex gap-5">
          {(!hosted || first) && <button type="button" className={link} aria-expanded={tryIt} onClick={() => setTryIt(!tryIt)}>{tryIt ? 'Hide example' : 'Try it'}</button>}
          <Link href={`/app/earn/${e.id}/edit`} className={link}>Edit</Link>
          <button type="button" className={`${link} hover:text-destructive`} onClick={() => setConfirm(true)}>Delete</button>
        </div>
      </div>
      {tryIt && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Answers 402 until paid</span>
          <Code text={first ? `curl -i ${first.method === 'GET' ? '' : `-X ${first.method} `}${e.upstreamUrl}${first.example ?? first.path}` : `curl -i ${url}`} className={code} />
        </div>
      )}
      <PDialog open={confirm} onOpenChange={setConfirm} title="Delete endpoint" description={<>Agents calling <span className="font-mono text-foreground">{e.name}</span> will get 404. Earnings so far are kept.</>}>
        <div className="flex justify-end gap-3">
          <Act onClick={() => setConfirm(false)}>Cancel</Act>
          <Act disabled={busy} onClick={del} className="border-destructive/60 text-destructive hover:border-destructive hover:bg-destructive hover:text-background">
            {busy ? 'Deleting…' : 'Delete'}
          </Act>
        </div>
      </PDialog>
    </div>
  )
}

/** Upstream headers PayCall adds when forwarding (seller's own API keys). Write-only: edit can replace or clear, never read. */
export function HeaderFields({ set, error, init }: { set?: boolean; error?: string; init?: Record<string, string> }) {
  const [rows, setRows] = useState<Row[]>(init ? Object.entries(init).map(([k, v]) => ({ k, v })) : set ? [] : [{ k: 'x-api-key', v: '' }])
  const [clear, setClear] = useState(false)
  const put = (i: number, r: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...r } : x)))
  const cell = 'h-9 font-mono text-xs md:text-xs'
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] text-muted-foreground">Upstream headers</legend>
      <input type="hidden" name="upstreamHeaders" value={JSON.stringify(clear ? [] : rows)} />
      <input type="hidden" name="clearHeaders" value={clear ? '1' : ''} />
      {set && !rows.length && (
        <div className="flex items-center justify-between border border-border px-3 py-2 text-xs">
          <span className={clear ? 'text-destructive' : 'text-muted-foreground'}>{clear ? 'Keys will be removed on save' : 'Keys set · encrypted'}</span>
          <button type="button" onClick={() => setClear(!clear)} className="text-muted-foreground transition-colors hover:text-foreground">{clear ? 'Undo' : 'Remove'}</button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`Header ${i + 1} name`} value={r.k} onChange={(e) => put(i, { k: e.target.value })} placeholder="x-api-key" spellCheck={false} autoComplete="off" className={`${cell} w-[38%]`} />
              <Input aria-label={`Header ${i + 1} value`} value={r.v} onChange={(e) => put(i, { v: e.target.value })} type="password" placeholder="value" spellCheck={false} autoComplete="new-password" className={`${cell} flex-1`} />
              <button type="button" aria-label={`Remove header ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="grid size-9 shrink-0 place-items-center border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" disabled={rows.length >= 10} onClick={() => { setClear(false); setRows((rs) => [...rs, { k: '', v: '' }]) }} className="self-start text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground disabled:opacity-40">
        {set && !rows.length ? 'Replace keys' : '+ Add header'}
      </button>
      {error ? <span className="text-xs text-destructive">{error}</span> : (
        <span className="text-xs text-muted-foreground/80">{set ? 'New headers replace all saved ones.' : 'Optional. If your API needs keys. Encrypted, sent only to your API, never shown again.'}</span>
      )}
    </fieldset>
  )
}

export type Errs = { name?: string; upstreamUrl?: string; price?: string; maxAmount?: string; upstreamHeaders?: string; form?: string }

export const MODES = [
  { k: 'call', label: 'Per call', price: 'Price per call' },
  { k: 'token', label: 'Per token', price: 'Price per token' },
  { k: 'char', label: 'Per character', price: 'Price per character' },
  { k: 'pass', label: 'Time pass', price: 'Price per pass' },
] as const
export const PASSES = [[3600, '1 hour'], [86_400, '24 hours'], [604_800, '7 days'], [2_592_000, '30 days']] as const
/** Pass select opts; keeps a non-preset duration (set via api) instead of silently overwriting it. */
export const passOpts = (cur?: number | null) => [...PASSES, ...(cur && !PASSES.some(([s]) => s === cur) ? [[cur, dur(cur)] as const] : [])].map(([s, l]) => ({ v: String(s), label: l }))
const DOLLARS = 'Dollars > 0, up to 6 decimals'
type PBody = { price: number } & ({ pricing: 'call' } | { pricing: 'token' | 'char'; maxAmount: number } | { pricing: 'pass'; passSeconds: number })

/** PricingFields → create/patch body (pricing unit always sent together). */
export function readPricing(f: FormData): { body: PBody; errs: Pick<Errs, 'price' | 'maxAmount'> } {
  const pricing = String(f.get('pricing')) as Pricing['pricing']
  const price = String(f.get('price')).trim(), max = String(f.get('maxAmount') ?? '').trim()
  const metered = pricing === 'token' || pricing === 'char'
  const errs = {
    price: !PRICE.test(price) || toMicros(price) < 1 ? DOLLARS : undefined,
    maxAmount: !metered ? undefined : !PRICE.test(max) || toMicros(max) < 1 ? DOLLARS : toMicros(max) < toMicros(price) ? `At least the price per ${pricing === 'char' ? 'character' : 'token'}` : undefined,
  }
  const p = toMicros(price)
  const body: PBody = metered ? { pricing, price: p, maxAmount: toMicros(max) } : pricing === 'pass' ? { pricing, price: p, passSeconds: Number(f.get('passSeconds')) } : { pricing: 'call', price: p }
  return { body, errs }
}

const money = (id: string, name: string, def: string, bad?: boolean) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
    <Input id={id} name={name} inputMode="decimal" defaultValue={def} className="pl-7 font-mono" aria-invalid={bad} />
  </div>
)

/** Pricing mode segmented control + price, and max (metered) or duration (pass). */
export function PricingFields({ id, d, errs = {} }: { id: string; d?: Pricing; errs?: Pick<Errs, 'price' | 'maxAmount'> }) {
  const [mode, setMode] = useState<Pricing['pricing']>(d?.pricing ?? 'call')
  const m = MODES.find((x) => x.k === mode)!
  const metered = mode === 'token' || mode === 'char'
  return (
    <>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] text-muted-foreground">Pricing</legend>
        <input type="hidden" name="pricing" value={mode} />
        <div role="radiogroup" className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          {MODES.map((x) => (
            <button key={x.k} type="button" role="radio" aria-checked={mode === x.k} onClick={() => setMode(x.k)} className={cn('h-9 bg-card text-[13px] transition-colors', mode === x.k ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {x.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className={cn('grid gap-4', mode !== 'call' && 'sm:grid-cols-2')}>
        <Field label={m.price} id={`${id}-price`} error={errs.price} hint={mode === 'call' ? 'Fractions of a cent work, e.g. 0.001.' : undefined}>
          {money(`${id}-price`, 'price', d ? toDollars(d.price) : '0.01', !!errs.price)}
        </Field>
        {metered && (
          <Field label="Max per call" id={`${id}-max`} error={errs.maxAmount}>
            {money(`${id}-max`, 'maxAmount', d?.maxAmount ? toDollars(d.maxAmount) : '0.05', !!errs.maxAmount)}
          </Field>
        )}
        {mode === 'pass' && (
          <Field label="Pass lasts" id={`${id}-pass`}>
            <Select id={`${id}-pass`} name="passSeconds" defaultValue={String(d?.passSeconds ?? 86_400)} opts={passOpts(d?.passSeconds)} />
          </Field>
        )}
      </div>
      {mode !== 'call' && (
        <p className="-mt-2 text-xs text-muted-foreground/80">
          {metered ? `Agents authorize the max; you're paid per ${mode === 'char' ? 'character' : 'token'} of the response, the rest goes back.` : 'One payment, unlimited calls until it expires.'}
        </p>
      )}
    </>
  )
}

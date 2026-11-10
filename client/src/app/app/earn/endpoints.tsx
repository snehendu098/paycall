'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { $, API, toDollars, toMicros } from '@/lib/api'
import { pc } from '@/lib/pc'
import { XIcon } from '@phosphor-icons/react'
import { Badge, Code, Input } from '@/components/ds'
import { Act, ease, errMsg, Field, Nothing, PDialog, Skel } from '@/components/portal'

export type Endpoint = { id: string; name: string; upstreamUrl: string; price: number; description: string | null; category: string | null; hasAuth: boolean; verified: boolean; createdAt: string }

const PRICE = /^\d+(\.\d{1,6})?$/
const HNAME = /^[A-Za-z0-9-]{1,64}$/
type Row = { k: string; v: string }
/** HeaderFields rows (hidden json input) → {header: value}; blank rows skipped. */
function readHeaders(f: FormData): { headers?: Record<string, string>; error?: string } {
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
  if (list.length === 0) return <Nothing>No endpoints yet. Create one to get a paid proxy URL for any HTTPS API.</Nothing>
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
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const url = proxyUrl(e.id)

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

  async function save(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const price = String(f.get('price')).trim()
    if (!PRICE.test(price) || toMicros(price) < 1) return setErr('Price: dollars > 0, up to 6 decimals')
    const { headers, error } = readHeaders(f)
    if (error) return setErr(error)
    const clear = f.get('clearHeaders') === '1'
    setErr('')
    setBusy(true)
    try {
      await pc('seller', `endpoints/${e.id}`, { method: 'PATCH', body: { description: String(f.get('description')).trim(), category: String(f.get('category')).trim(), price: toMicros(price), ...(headers ? { upstreamHeaders: headers } : clear && { upstreamHeaders: null }) } })
      toast.success(`${e.name} updated`)
      setEdit(false)
      reload()
    } catch (x) {
      setErr(errMsg(x))
    } finally {
      setBusy(false)
    }
  }

  const code = '[&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:py-2.5 [&_pre]:text-[12px]'
  return (
    <div data-testid="endpoint" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm">{e.name}</span>
            {e.verified && <Badge tone="live">Verified</Badge>}
            {e.hasAuth && <Badge tone="muted">Key set</Badge>}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground" title={e.upstreamUrl}>{e.upstreamUrl}</div>
        </div>
        <span className="shrink-0 font-mono text-sm">{$(e.price)}<span className="text-muted-foreground"> / call</span></span>
      </div>
      {(e.category || e.description) && (
        <p className="text-[13px] text-muted-foreground">
          {e.category && <Badge tone="muted" className="mr-2 align-middle">{e.category}</Badge>}
          {e.description}
        </p>
      )}
      <Code text={url} className={code} />
      <div className="flex gap-5">
        <button type="button" className={link} aria-expanded={tryIt} onClick={() => setTryIt(!tryIt)}>{tryIt ? 'Hide example' : 'Try it'}</button>
        <button type="button" className={link} aria-expanded={edit} onClick={() => { setErr(''); setEdit(!edit) }}>{edit ? 'Cancel edit' : 'Edit'}</button>
        <button type="button" className={`${link} hover:text-destructive`} onClick={() => setConfirm(true)}>Delete</button>
      </div>
      {edit && (
        <form onSubmit={save} noValidate className="flex flex-col gap-4 border border-border p-4">
          <MetaFields id={e.id} d={e} />
          <HeaderFields set={e.hasAuth} />
          <Field label="Price per call" id={`${e.id}-price`}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
              <Input id={`${e.id}-price`} name="price" inputMode="decimal" defaultValue={toDollars(e.price)} className="pl-7 font-mono" />
            </div>
          </Field>
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          <div className="flex justify-end"><Act primary type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Act></div>
        </form>
      )}
      {tryIt && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Answers 402 until paid</span>
          <Code text={`curl -i ${url}`} className={code} />
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
function HeaderFields({ set, error }: { set?: boolean; error?: string }) {
  const [rows, setRows] = useState<Row[]>(set ? [] : [{ k: 'x-api-key', v: '' }])
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

/** Description + category inputs shared by create / edit. */
function MetaFields({ id, d }: { id: string; d?: Pick<Endpoint, 'description' | 'category'> }) {
  return (
    <>
      <Field label="Description" id={`${id}-desc`} hint="Optional. Agents search this.">
        <textarea id={`${id}-desc`} name="description" maxLength={500} rows={2} defaultValue={d?.description ?? ''} placeholder="Current weather by city" className="w-full resize-y border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground" />
      </Field>
      <Field label="Category" id={`${id}-cat`} hint="Optional, e.g. weather, search, llm.">
        <Input id={`${id}-cat`} name="category" maxLength={32} defaultValue={d?.category ?? ''} placeholder="weather" />
      </Field>
    </>
  )
}

type Errs = { name?: string; upstreamUrl?: string; price?: string; upstreamHeaders?: string; form?: string }

/** "New endpoint" dialog with validation. */
export function NewEndpoint({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [errs, setErrs] = useState<Errs>({})
  const [busy, setBusy] = useState(false)

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const name = String(f.get('name')).trim(), upstreamUrl = String(f.get('upstreamUrl')).trim(), price = String(f.get('price')).trim()
    let https = false
    try { https = new URL(upstreamUrl).protocol === 'https:' } catch {}
    const v: Errs = {
      name: !name ? 'Name it' : name.length > 64 ? 'Max 64 characters' : undefined,
      upstreamUrl: !https ? 'Must be a full https:// URL' : undefined,
      price: !PRICE.test(price) || toMicros(price) < 1 ? 'Dollars > 0, up to 6 decimals' : undefined,
      upstreamHeaders: readHeaders(f).error,
    }
    setErrs(v)
    if (v.name || v.upstreamUrl || v.price || v.upstreamHeaders) return
    setBusy(true)
    try {
      const description = String(f.get('description')).trim() || undefined, category = String(f.get('category')).trim() || undefined
      await pc('seller', 'endpoints', { body: { name, upstreamUrl, price: toMicros(price), description, category, upstreamHeaders: readHeaders(f).headers } })
      toast.success(`${name} is live`, { description: `${$(toMicros(price))} per call` })
      setOpen(false)
      onCreated()
    } catch (e) {
      setErrs({ form: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Act onClick={() => { setErrs({}); setOpen(true) }}>New endpoint</Act>
      <PDialog open={open} onOpenChange={setOpen} title="New endpoint" description="PayCall answers 402 until the agent pays, then forwards the request to your API.">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Field label="Name" id="ep-name" error={errs.name}>
            <Input id="ep-name" name="name" placeholder="weather" autoFocus maxLength={64} aria-invalid={!!errs.name} />
          </Field>
          <Field label="Upstream URL" id="ep-url" error={errs.upstreamUrl} hint="Your API, as is. HTTPS only.">
            <Input id="ep-url" name="upstreamUrl" type="url" placeholder="https://api.example.com/v1" className="font-mono" aria-invalid={!!errs.upstreamUrl} />
          </Field>
          <Field label="Price per call" id="ep-price" error={errs.price} hint="Fractions of a cent work, e.g. 0.001.">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
              <Input id="ep-price" name="price" inputMode="decimal" defaultValue="0.01" className="pl-7 font-mono" aria-invalid={!!errs.price} />
            </div>
          </Field>
          <MetaFields id="ep" />
          <HeaderFields error={errs.upstreamHeaders} />
          {errs.form && <p role="alert" className="text-xs text-destructive">{errs.form}</p>}
          <div className="flex justify-end pt-1">
            <Act primary type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create endpoint'}</Act>
          </div>
        </form>
      </PDialog>
    </>
  )
}

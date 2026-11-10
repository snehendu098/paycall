'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { $, API, toMicros } from '@/lib/api'
import { pc } from '@/lib/pc'
import { Code, Input } from '@/components/ds'
import { Act, ease, errMsg, Field, Nothing, PDialog, Skel } from '@/components/portal'

export type Endpoint = { id: string; name: string; upstreamUrl: string; price: number; createdAt: string }

const PRICE = /^\d+(\.\d{1,6})?$/
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
  const [busy, setBusy] = useState(false)
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

  const code = '[&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:py-2.5 [&_pre]:text-[12px]'
  return (
    <div data-testid="endpoint" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm">{e.name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground" title={e.upstreamUrl}>{e.upstreamUrl}</div>
        </div>
        <span className="shrink-0 font-mono text-sm">{$(e.price)}<span className="text-muted-foreground"> / call</span></span>
      </div>
      <Code text={url} className={code} />
      <div className="flex gap-5">
        <button type="button" className={link} aria-expanded={tryIt} onClick={() => setTryIt(!tryIt)}>{tryIt ? 'Hide example' : 'Try it'}</button>
        <button type="button" className={`${link} hover:text-destructive`} onClick={() => setConfirm(true)}>Delete</button>
      </div>
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

type Errs = { name?: string; upstreamUrl?: string; price?: string; form?: string }

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
    }
    setErrs(v)
    if (v.name || v.upstreamUrl || v.price) return
    setBusy(true)
    try {
      await pc('seller', 'endpoints', { body: { name, upstreamUrl, price: toMicros(price) } })
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
      <PDialog open={open} onOpenChange={setOpen} title="New endpoint" description="PayCall answers 402 until the agent pays, then forwards the request to your API untouched.">
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
          {errs.form && <p role="alert" className="text-xs text-destructive">{errs.form}</p>}
          <div className="flex justify-end pt-1">
            <Act primary type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create endpoint'}</Act>
          </div>
        </form>
      </PDialog>
    </>
  )
}

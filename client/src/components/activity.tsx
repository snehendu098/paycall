'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { $, ago, short, toDollars, toMicros, type Dispute, type Entry } from '@/lib/api'
import { events, pc, type Role } from '@/lib/pc'
import { Input } from '@/components/ds'
import { Act, Block, ease, errMsg, Field, Nothing, PDialog, Skel } from '@/components/portal'

const TYPES = ['topup', 'reload', 'charge', 'refund', 'payout', 'fee'] as const
const byNewest = (a: Entry, b: Entry) => Number(b.id) - Number(a.id) || +new Date(b.createdAt) - +new Date(a.createdAt)
// upsert by id, newest first; field merge so raw sse rows keep fetched refunded/dispute
const merge = (e: Entry[]) => (r?: Entry[]) => {
  const m = new Map((r ?? []).map((x) => [String(x.id), x]))
  for (const x of e) m.set(String(x.id), { ...m.get(String(x.id)), ...x })
  return [...m.values()].sort(byNewest)
}

/** History + SSE (named events), dedup by id, newest first. `fresh` = ids that arrived live. */
export function useLedger(role: Role, onEvent?: (e: Entry) => void) {
  const [rows, setRows] = useState<Entry[]>()
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const [live, setLive] = useState(false)
  const fire = useEffectEvent((e: Entry) => onEvent?.(e))
  // ponytail: last 100 only, paginate via ?before when someone needs more
  const refresh = useCallback(() => pc<Entry[]>(role, 'entries?limit=100').then((e) => setRows(merge(e)), () => setRows((r) => r ?? [])), [role])

  useEffect(() => {
    refresh()
    const es = events(role)
    es.onopen = () => setLive(true)
    es.onerror = () => setLive(false)
    for (const t of TYPES)
      es.addEventListener(t, (ev) => {
        const e = JSON.parse((ev as MessageEvent).data) as Entry
        setFresh((f) => new Set(f).add(String(e.id)))
        setRows(merge([e]))
        // sse rows are raw; refetch so the parent charge's refunded/dispute are current
        if (e.type === 'refund') refresh()
        fire(e)
      })
    return () => es.close()
  }, [role, refresh])

  return { rows, fresh, live, refresh }
}

/** "● Live" dot for section asides. */
export function LiveDot({ live }: { live: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', live && 'text-live')}>
      <span aria-hidden className={cn('size-1.5 rounded-full', live ? 'pc-pulse bg-live' : 'bg-muted-foreground/50')} />
      {live ? 'Live' : 'Connecting'}
    </span>
  )
}

const label: Record<Role, Record<Entry['type'], string>> = {
  buyer: { topup: 'PayPal top-up', reload: 'Auto-reload', charge: 'Paid call', refund: 'Refund', payout: 'Payout', fee: 'Fee' },
  seller: { topup: 'Top-up', reload: 'Reload', charge: 'Paid call', refund: 'Refund', payout: 'Payout to PayPal', fee: 'Payout fee · 2%' },
}
// metered calls settle the max then refund the rest (ref rf:<charge>:unused); fold those into the charge
const isUnused = (e: Entry) => e.type === 'refund' && !!e.ref?.endsWith(':unused')
const WINDOW = 7 * 86_400_000 // server DISPUTE_WINDOW_DAYS
const WHY: Record<string, string> = {
  already_refunded: 'Already fully refunded',
  refund_exceeds_charge: 'More than is left on this charge',
  duplicate_refund: 'Already refunded',
  already_disputed: 'Already disputed',
  dispute_window_closed: 'Disputes close 7 days after the charge',
  unknown_dispute: 'Already resolved',
}
const why = (e: unknown) => WHY[errMsg(e)] ?? errMsg(e)
const quiet = 'text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground'
// sign from the viewer's side
const sign = (role: Role, t: Entry['type']) => (role === 'buyer' ? (t === 'charge' ? -1 : 1) : t === 'charge' ? 1 : -1)

/** Live ledger list. `names` maps agent pubkey → name. Seller can refund charges, buyer can dispute them. */
export function Activity({ role, rows, fresh, names, onChanged }: { role: Role; rows?: Entry[]; fresh: Set<string>; names?: Record<string, string>; onChanged?: () => void }) {
  const [act, setAct] = useState<Entry>()
  const [now, setNow] = useState(() => Date.now()) // 15s tick re-renders ago()
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  if (!rows)
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {[...Array(3)].map((_, i) => <Skel key={i} className="h-9" />)}
      </div>
    )
  const unused = new Map<string, number>()
  for (const e of rows) if (isUnused(e)) unused.set(String(e.parentId), (unused.get(String(e.parentId)) ?? 0) + e.amount)
  const list = rows.filter((e) => !isUnused(e))
  if (list.length === 0)
    return <Nothing>{role === 'buyer' ? 'No activity yet. Top-ups and paid calls show up here live.' : 'No activity yet. Paid calls show up here the moment they settle.'}</Nothing>

  return (
    <>
    <ul className="max-h-[520px] overflow-y-auto border-t border-border" data-testid="activity">
      <AnimatePresence initial={false}>
        {list.map((e) => {
          const s = sign(role, e.type)
          const isNew = fresh.has(String(e.id))
          const who = e.agentPubkey ? (names?.[e.agentPubkey] ?? short(e.agentPubkey)) : null
          const fold = unused.get(String(e.id)) ?? 0
          const back = (e.refunded ?? 0) - fold // refunded beyond the metered unused part
          const left = e.amount - (e.refunded ?? 0)
          const can = e.type === 'charge' && left > 0 && (role === 'seller' || (!e.dispute && now - +new Date(e.createdAt) < WINDOW))
          return (
            <motion.li
              key={String(e.id)}
              layout="position"
              initial={isNew ? { opacity: 0, y: -8, backgroundColor: 'rgb(143 176 245 / 0.1)' } : false}
              animate={{ opacity: 1, y: 0, backgroundColor: 'rgb(143 176 245 / 0)' }}
              transition={{ duration: 0.5, ease, backgroundColor: { duration: 2.4, ease: 'easeOut' } }}
              className="group flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm" title={e.resource ?? undefined}>{e.ref?.includes(':dispute:') ? 'Dispute refund' : label[role][e.type]}</span>
                <span className="block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {who && <span className="font-mono">{who} · </span>}
                  {e.units != null && <>{e.units.toLocaleString()} units · </>}
                  {ago(e.createdAt)}
                  {back > 0 && <> · <span className="font-mono">{$(back)}</span> refunded</>}
                  {e.dispute && <span className={e.dispute === 'open' ? 'text-live' : undefined}> · dispute {e.dispute}</span>}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className={cn('font-mono text-sm tabular-nums', s > 0 ? 'text-live' : 'text-foreground')}>
                  {s > 0 ? '+' : '−'}{$(Math.abs(e.amount - fold))}
                </span>
                {can && <button type="button" onClick={() => setAct(e)} className={cn(quiet, 'focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100')}>{role === 'seller' ? 'Refund' : 'Dispute'}</button>}
              </span>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
    <PDialog
      open={!!act}
      onOpenChange={(o) => !o && setAct(undefined)}
      title={role === 'seller' ? 'Refund charge' : 'Dispute charge'}
      description={act && <><span className="font-mono text-foreground">{$(act.amount - (act.refunded ?? 0))}</span>{act.resource && <> for <span className="break-all font-mono">{act.resource}</span></>}</>}
    >
      {act && (role === 'seller' ? <RefundForm e={act} onDone={() => { setAct(undefined); onChanged?.() }} /> : <DisputeForm e={act} onDone={() => { setAct(undefined); onChanged?.() }} />)}
    </PDialog>
    </>
  )
}

const MONEY = /^\d+(\.\d{1,6})?$/

/** Full remainder by default; lower it for a partial refund. */
function RefundForm({ e, onDone }: { e: Entry; onDone: () => void }) {
  const left = e.amount - (e.refunded ?? 0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const v = String(new FormData(ev.currentTarget).get('amount')).trim()
    const m = toMicros(v)
    if (!MONEY.test(v) || m < 1) return setErr('Enter a dollar amount')
    if (m > left) return setErr(`At most ${$(left)}`)
    setErr('')
    setBusy(true)
    try {
      await pc('seller', `entries/${e.id}/refund`, { method: 'POST', body: m === left ? {} : { amount: m } })
      toast.success(`Refunded ${$(m)}`)
      onDone()
    } catch (x) {
      setErr(why(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Amount" id="rf-amount" error={err} hint="Full amount by default. Goes back to the buyer's balance, out of your earnings.">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
          <Input id="rf-amount" name="amount" inputMode="decimal" defaultValue={toDollars(left)} className="pl-7 font-mono" aria-invalid={!!err} />
        </div>
      </Field>
      <div className="flex justify-end"><Act primary type="submit" disabled={busy}>{busy ? 'Refunding…' : 'Refund'}</Act></div>
    </form>
  )
}

function DisputeForm({ e, onDone }: { e: Entry; onDone: () => void }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const reason = String(new FormData(ev.currentTarget).get('reason')).trim()
    if (reason.length < 3) return setErr('Say what went wrong')
    setErr('')
    setBusy(true)
    try {
      await pc('buyer', `entries/${e.id}/dispute`, { method: 'POST', body: { reason } })
      toast.success('Dispute opened', { description: 'The seller can refund or reject it.' })
      onDone()
    } catch (x) {
      setErr(why(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Reason" id="dp-reason" error={err} hint="The seller sees this. The amount is held from their payout until they decide.">
        <textarea id="dp-reason" name="reason" autoFocus minLength={3} maxLength={500} rows={3} placeholder="Response was empty" aria-invalid={!!err} className="w-full resize-y border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground" />
      </Field>
      <div className="flex justify-end"><Act primary type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open dispute'}</Act></div>
    </form>
  )
}

const dtone = { open: 'text-live', refunded: 'text-muted-foreground', rejected: 'text-muted-foreground' } as const

/** Disputes, open first; seller resolves. Hidden when none. */
export function Disputes({ role, list, onChanged }: { role: Role; list?: Dispute[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<number>()
  if (!list?.length) return null
  const sorted = [...list].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.id - a.id)
  const open = list.filter((d) => d.status === 'open').length

  async function resolve(d: Dispute, action: 'refund' | 'reject') {
    setBusy(d.id)
    try {
      await pc('seller', `disputes/${d.id}`, { method: 'POST', body: { action } })
      toast.success(action === 'refund' ? `Refunded ${$(d.amount)}` : 'Dispute rejected')
    } catch (e) {
      toast.error("Couldn't resolve dispute", { description: why(e) })
    } finally {
      setBusy(undefined)
      onChanged()
    }
  }

  return (
    <Block title="Disputes" aside={role === 'seller' && open > 0 && <span className="text-xs text-muted-foreground">Held from payouts while open</span>}>
      <ul className="max-h-[420px] overflow-y-auto border-t border-border" data-testid="disputes">
        {sorted.map((d) => (
          <li key={d.id} className="flex flex-col gap-3 border-b border-border py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate" title={d.reason}>{d.reason}</span>
                <span className="shrink-0 font-mono">{$(d.amount)}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                <span className={dtone[d.status]}>{d.status}</span>
                {d.resource && <> · <span className="font-mono" title={d.resource}>{d.resource}</span></>} · {ago(d.createdAt)}
              </div>
            </div>
            {role === 'seller' && d.status === 'open' && (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Act disabled={busy === d.id} onClick={() => resolve(d, 'reject')}>Reject</Act>
                <Act primary disabled={busy === d.id} onClick={() => resolve(d, 'refund')}>Refund</Act>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Block>
  )
}

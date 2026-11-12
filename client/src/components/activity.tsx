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
        // sse rows raw; refetch so parent charge refunded/dispute current
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
    <span className={cn('text-xs text-muted-foreground', live && 'text-live')}>
      {live ? 'Live' : 'Connecting'}
    </span>
  )
}

const label: Record<Role, Record<Entry['type'], string>> = {
  buyer: { topup: 'PayPal top-up', reload: 'Auto-reload', charge: 'Paid call', refund: 'Refund', payout: 'Payout', fee: 'Fee' },
  seller: { topup: 'Top-up', reload: 'Reload', charge: 'Paid call', refund: 'Refund', payout: 'Payout to PayPal', fee: 'Payout fee · 2%' },
}
// metered: settle max, refund rest (ref rf:<charge>:unused); fold into charge
const isUnused = (e: Entry) => e.type === 'refund' && !!e.ref?.endsWith(':unused')
const PAGE = 12
const WINDOW = 7 * 86_400_000 // server DISPUTE_WINDOW_DAYS
const WHY: Record<string, string> = {
  already_refunded: 'Already fully refunded',
  refund_exceeds_charge: 'More than is left on this charge',
  duplicate_refund: 'Already refunded',
  already_disputed: 'Already disputed',
  dispute_window_closed: 'Disputes close 7 days after the charge',
  unknown_dispute: 'Already resolved',
  not_escalatable: 'Can only escalate a seller rejection, once, within 3 days',
}
const why = (e: unknown) => WHY[errMsg(e)] ?? errMsg(e)
export const quiet = 'text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground'
// sign from viewer's side
const sign = (role: Role, t: Entry['type']) => (role === 'buyer' ? (t === 'charge' ? -1 : 1) : t === 'charge' ? 1 : -1)

/** Live ledger list. `names` maps agent pubkey → name. Seller can refund charges, buyer can dispute them. */
export function Activity({ role, rows, fresh, names, onChanged }: { role: Role; rows?: Entry[]; fresh: Set<string>; names?: Record<string, string>; onChanged?: () => void }) {
  const [act, setAct] = useState<Entry>()
  const [limit, setLimit] = useState(PAGE)
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

  const shown = list.slice(0, limit)
  const day = (d: string) => {
    const t = new Date(d), today = new Date(now)
    const diff = Math.round((+new Date(today.toDateString()) - +new Date(t.toDateString())) / 86_400_000)
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: t.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
  }
  return (
    <>
    <ul className="border-t border-border" data-testid="activity">
      <AnimatePresence initial={false}>
        {shown.map((e, i) => {
          const s = sign(role, e.type)
          const isNew = fresh.has(String(e.id))
          const who = e.agentPubkey ? (names?.[e.agentPubkey] ?? short(e.agentPubkey)) : null
          const fold = unused.get(String(e.id)) ?? 0
          const back = (e.refunded ?? 0) - fold // refunded beyond metered unused part
          const left = e.amount - (e.refunded ?? 0)
          const can = e.type === 'charge' && left > 0 && (role === 'seller' || (!e.dispute && now - +new Date(e.createdAt) < WINDOW))
          const d = day(e.createdAt)
          const title = e.ref?.includes(':dispute:') ? 'Dispute refund' : e.type === 'charge' ? (e.endpoint ?? label[role].charge) : label[role][e.type]
          const sub = [
            e.type === 'refund' && e.endpoint,
            role === 'buyer' && e.type === 'charge' && e.seller,
            who,
            e.units != null && `${e.units.toLocaleString()} ${e.unit === 'char' ? 'chars' : 'tokens'}`,
            d === 'Today' ? ago(e.createdAt) : new Date(e.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
          ].filter(Boolean) as string[]
          const head = i === 0 || day(shown[i - 1]!.createdAt) !== d
          return (
            <motion.li
              key={String(e.id)}
              layout="position"
              initial={isNew ? { opacity: 0, y: -8, backgroundColor: 'rgb(143 176 245 / 0.1)' } : false}
              animate={{ opacity: 1, y: 0, backgroundColor: 'rgb(143 176 245 / 0)' }}
              transition={{ duration: 0.5, ease, backgroundColor: { duration: 2.4, ease: 'easeOut' } }}
            >
              {head && <div className="pb-1 pt-5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 first:pt-4" suppressHydrationWarning>{d}</div>}
              <div className="group flex items-center justify-between gap-4 border-b border-border/60 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm" title={e.resource ?? undefined}>{title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                    {sub.join(' · ')}
                    {back > 0 && <> · <span className="font-mono">{$(back)}</span> refunded</>}
                    {e.dispute && <span className={e.dispute === 'open' ? 'text-live' : undefined}> · dispute {e.dispute}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  {can && <button type="button" onClick={() => setAct(e)} className={cn(quiet, 'focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100')}>{role === 'seller' ? 'Refund' : 'Dispute'}</button>}
                  <span className={cn('min-w-[72px] text-right font-mono text-sm tabular-nums', s > 0 ? 'text-live' : 'text-foreground')}>
                    {s > 0 ? '+' : '−'}{$(Math.abs(e.amount - fold))}
                  </span>
                </span>
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
    {list.length > limit && (
      <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mt-4 self-start text-[13px] text-muted-foreground transition-colors hover:text-foreground">
        Show {Math.min(PAGE, list.length - limit)} more
      </button>
    )}
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
      toast.success('Dispute opened', { description: 'The seller has 3 days to refund or reject it. No answer means an automatic refund.' })
      onDone()
    } catch (x) {
      setErr(why(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Reason" id="dp-reason" error={err} hint="The seller sees this. The amount is held from their payout until it's decided. If they reject it, you can escalate to PayCall.">
        <textarea id="dp-reason" name="reason" autoFocus minLength={3} maxLength={500} rows={3} placeholder="Response was empty" aria-invalid={!!err} className="w-full resize-y border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground" />
      </Field>
      <div className="flex justify-end"><Act primary type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open dispute'}</Act></div>
    </form>
  )
}

const DAY = 86_400_000
const RESPOND = 3 * DAY // server RESPOND_DAYS
const ESCALATE = 3 * DAY // server ESCALATE_DAYS
const daysLeft = (from: string, span: number) => Math.max(1, Math.ceil((+new Date(from) + span - Date.now()) / DAY))
const live = (d: Dispute) => d.status === 'open' || d.status === 'escalated'
const canEscalate = (d: Dispute) => d.status === 'rejected' && d.decidedBy === 'seller' && !!d.resolvedAt && Date.now() - +new Date(d.resolvedAt) < ESCALATE

type Stage = { label: string; tone: 'live' | 'muted' | 'default'; hint?: string }
// status + next step, viewer's side
function stage(d: Dispute, role: Role): Stage {
  if (d.status === 'open') {
    const n = daysLeft(d.createdAt, RESPOND)
    return { label: 'Open', tone: 'live', hint: role === 'seller' ? `answer within ${n}d or it auto-refunds` : `auto-refunds in ${n}d if the seller doesn't answer` }
  }
  if (d.status === 'escalated') return { label: 'Under review', tone: 'live', hint: 'PayCall decides' }
  if (d.status === 'refunded') return { label: 'Refunded', tone: 'muted', hint: d.decidedBy === 'timeout' ? "seller didn't answer" : d.decidedBy === 'admin' ? 'by PayCall' : undefined }
  if (d.decidedBy === 'admin') return { label: 'Rejected', tone: 'muted', hint: 'final, by PayCall' }
  if (d.decidedBy === 'buyer') return { label: 'Resolved', tone: 'muted', hint: role === 'buyer' ? 'by you' : 'by the buyer' }
  if (!canEscalate(d)) return { label: 'Rejected', tone: 'muted' }
  const n = daysLeft(d.resolvedAt!, ESCALATE)
  return { label: 'Rejected', tone: 'default', hint: role === 'seller' ? `buyer can escalate for ${n}d` : `escalate within ${n}d` }
}
const toneText = { live: 'text-live', default: 'text-foreground', muted: 'text-muted-foreground' } as const
// dispute listing name: ledger row, else url path
export const pathOf = (r: string | null) => (r && new URL(r, 'https://x').pathname.split('/').filter(Boolean).slice(2).join('/')) || 'Charge'
const titleOf = (d: Dispute, charges?: Entry[]) => charges?.find((e) => Number(e.id) === d.entryId)?.endpoint ?? pathOf(d.resource)

/** Disputes, actionable first. Seller refunds/rejects w/ reason; buyer escalates reject to PayCall once. Hidden when none. */
export function Disputes({ role, list, charges, onChanged }: { role: Role; list?: Dispute[]; charges?: Entry[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<number>()
  const [rejecting, setRejecting] = useState<Dispute>()
  if (!list?.length) return null
  const rank = (d: Dispute) => (role === 'seller' ? d.status === 'open' : canEscalate(d)) ? 2 : live(d) ? 1 : 0 // your move first
  const sorted = [...list].sort((a, b) => rank(b) - rank(a) || b.id - a.id)
  const held = list.some((d) => live(d) || canEscalate(d))

  async function act(d: Dispute, path: string, body: object | undefined, ok: string) {
    setBusy(d.id)
    try {
      await pc(role, `disputes/${path}`, { method: 'POST', body })
      toast.success(ok)
      setRejecting(undefined)
    } catch (e) {
      toast.error("Couldn't update dispute", { description: why(e) })
    } finally {
      setBusy(undefined)
      onChanged()
    }
  }
  function reject(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const reply = String(new FormData(ev.currentTarget).get('reply')).trim()
    if (rejecting && reply.length >= 3) act(rejecting, String(rejecting.id), { action: 'reject', reply }, 'Dispute rejected')
  }

  return (
    <Block title="Disputes" aside={role === 'seller' && held && <span className="text-xs text-muted-foreground">Held from payouts until decided</span>}>
      <ul className="border-t border-border" data-testid="disputes">
        {sorted.map((d) => {
          const st = stage(d, role)
          const link = (label: string, run: () => void, cls?: string) => (
            <button type="button" disabled={busy === d.id} onClick={run} className={cn(quiet, 'disabled:opacity-50', cls)}>{label}</button>
          )
          const actions =
            role === 'seller' && d.status === 'open'
              ? [link('Reject', () => setRejecting(d)), link('Refund', () => act(d, String(d.id), { action: 'refund' }, `Refunded ${$(d.amount)}`), 'text-foreground')]
              : role === 'buyer' && (d.status === 'open' || canEscalate(d))
                ? [link('Mark as resolved', () => act(d, `${d.id}/close`, undefined, 'Marked as resolved')), canEscalate(d) && link('Escalate', () => act(d, `${d.id}/escalate`, undefined, 'Sent to PayCall for review'), 'text-foreground')]
                : []
          const quotes = [
            [role === 'buyer' ? 'You' : 'Buyer', d.reason],
            d.reply && [role === 'seller' ? 'You' : 'Seller', d.reply],
            d.adminNote && ['PayCall', d.adminNote],
          ].filter(Boolean) as [string, string][]
          return (
            <li key={d.id} className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:justify-between sm:gap-8">
              <div className="min-w-0">
                <div className="truncate text-sm" title={d.resource ?? undefined}>{titleOf(d, charges)}</div>
                <div className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
                  <span className={toneText[st.tone]}>{st.label}</span> · {ago(d.createdAt)}{st.hint && <> · {st.hint}</>}
                </div>
                <div className="mt-2 flex flex-col gap-0.5 text-[13px] leading-relaxed text-muted-foreground">
                  {quotes.map(([who, text]) => <p key={who} className="break-words"><span className="text-foreground/60">{who}:</span> “{text}”</p>)}
                </div>
              </div>
              <div className="flex shrink-0 items-baseline justify-between gap-5 sm:flex-col sm:items-end sm:justify-start sm:gap-2">
                <span className="font-mono text-sm tabular-nums">{$(d.amount)}</span>
                {actions.some(Boolean) && <div className="flex gap-4">{actions.filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}</div>}
              </div>
            </li>
          )
        })}
      </ul>
      <PDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(undefined)} title="Reject dispute" description="The buyer sees your reason and can escalate to PayCall once. The amount stays held until then.">
        <form onSubmit={reject} className="flex flex-col gap-5">
          <Field label="Reason" id="dp-reply" hint={rejecting ? `Buyer said: “${rejecting.reason}”` : undefined}>
            <textarea id="dp-reply" name="reply" autoFocus required minLength={3} maxLength={500} rows={3} placeholder="The response matched the docs" className="w-full resize-y border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground" />
          </Field>
          <div className="flex justify-end"><Act primary type="submit" disabled={busy === rejecting?.id}>{busy === rejecting?.id ? 'Rejecting…' : 'Reject'}</Act></div>
        </form>
      </PDialog>
    </Block>
  )
}

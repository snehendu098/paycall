'use client'

import { ArrowLeftIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { $, ago, per, short, type AdminDispute } from '@/lib/api'
import { pc } from '@/lib/pc'
import { cn } from '@/lib/utils'
import { pathOf } from '@/components/activity'
import { Act, Block, Empty, errMsg, Field, Page, PDialog, PageSkeleton, useApi } from '@/components/portal'

const when = (t: string) => `${new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${ago(t)}`

export default function AdminDisputePage() {
  const { id } = useParams<{ id: string }>()
  const { data: d, error } = useApi<AdminDispute>('admin', `disputes/${id}`)
  if (error === 'forbidden') return <Empty title="Admins only" sub="This account isn't a PayCall admin." />
  if (error && !d) return <Page><Back /><p className="text-sm text-destructive">Couldn&apos;t load dispute: {error}</p></Page>
  if (!d) return <PageSkeleton />
  const held = d.status === 'open' || d.status === 'escalated'
  const status = { open: 'Open', escalated: 'Under review', refunded: 'Refunded', rejected: 'Rejected' }[d.status]
  // seller's reject time is cleared on escalate (ledger), so only known before
  const sellerAt = d.decidedBy === 'seller' && !d.escalatedAt ? d.resolvedAt : null
  const steps: [string, string | null, string | null][] = [
    ['Charged', d.chargedAt, null],
    ['Buyer opened dispute', d.createdAt, d.reason],
    ...(d.reply ? [['Seller rejected', sellerAt, d.reply] as [string, string | null, string]] : []),
    ...(d.escalatedAt ? [['Escalated to PayCall', d.escalatedAt, null] as [string, string, null]] : []),
    ...(d.decidedBy === 'admin' ? [[`PayCall ${d.status === 'refunded' ? 'refunded' : 'rejected'}`, d.resolvedAt, d.adminNote] as [string, string | null, string | null]] : []),
  ]
  return (
    <Page>
      <section>
        <Back />
        <h1 className="mt-6 break-words text-[40px] font-light leading-none tracking-[-0.03em] md:text-5xl">{d.endpoint ?? pathOf(d.resource)}</h1>
        <div className="mt-4 text-sm text-muted-foreground" suppressHydrationWarning>
          <span className={held ? 'text-live' : 'text-foreground'}>{status}</span> · dispute #{d.id} · {held ? <><span className="font-mono text-foreground">{$(d.amount)}</span> held from seller</> : <span className="font-mono">{$(d.amount)}</span>}
        </div>
      </section>

      {d.status === 'escalated' && <Decide d={d} />}

      <Block title="Exchange">
        <ol className="border-t border-border">
          {steps.map(([label, at, text]) => (
            <li key={label} className="relative border-b border-border py-4 pl-6 last:border-b-0">
              <span className={cn('absolute left-0 top-[22px] size-1.5', label.startsWith('PayCall') || label.startsWith('Escalated') ? 'bg-live' : 'bg-foreground/40')} />
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="text-sm">{label}</span>
                {at && <span className="text-xs text-muted-foreground" suppressHydrationWarning>{when(at)}</span>}
              </div>
              {text && <p className="mt-1.5 break-words text-[13px] leading-relaxed text-muted-foreground">“{text}”</p>}
            </li>
          ))}
        </ol>
      </Block>

      <div className="grid gap-16 md:grid-cols-2 md:gap-10">
        <Block title="Buyer">
          <Rows rows={[
            ['Email', d.ownerEmail],
            ['Agent', d.agentName ?? '—'],
            ['Agent key', <span key="k" className="font-mono" title={d.agentPubkey ?? undefined}>{short(d.agentPubkey)}</span>],
          ]} />
        </Block>
        <Block title="Seller">
          <Rows rows={[
            ['Name', d.seller],
            ['PayPal', d.sellerPaypal],
            ['Seller id', <span key="s" className="font-mono">{d.sellerId}</span>],
          ]} />
        </Block>
      </div>

      <Block title="What was bought">
        <Rows rows={[
          ['Listing', d.endpoint ?? '—'],
          ['URL called', <span key="u" className="break-all font-mono">{d.resource ?? '—'}</span>],
          ['Pricing', d.pricing && d.price != null ? <span key="p" className="font-mono">{$(d.price)}{per({ pricing: d.pricing, price: d.price, maxAmount: d.maxAmount ?? null, passSeconds: d.passSeconds ?? null })}</span> : '—'],
          ['Charge', <span key="c" suppressHydrationWarning><span className="font-mono">{$(d.charged)}</span> · {when(d.chargedAt)}</span>],
          ...(d.units != null ? [['Units', `${d.units.toLocaleString()} ${d.unit ?? ''}${d.units === 1 ? '' : 's'}`] as [string, ReactNode]] : []),
          ['Disputed', <span key="d" className="font-mono">{$(d.amount)}</span>],
        ]} />
      </Block>
    </Page>
  )
}

const Back = () => <Link href="/app/admin" className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeftIcon aria-hidden className="size-4" />Admin</Link>

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="border-t border-border text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-b border-border py-3 last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Final call: refund or reject, optional note → adminNote. */
function Decide({ d }: { d: AdminDispute }) {
  const router = useRouter()
  const [action, setAction] = useState<'refund' | 'reject'>()
  const [busy, setBusy] = useState(false)
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!action) return
    const reply = String(new FormData(ev.currentTarget).get('reply')).trim()
    setBusy(true)
    try {
      await pc('admin', `disputes/${d.id}`, { method: 'POST', body: { action, ...(reply && { reply }) } })
      toast.success(action === 'refund' ? `Refunded ${$(d.amount)}` : 'Dispute rejected')
      router.push('/app/admin')
    } catch (e) {
      toast.error("Couldn't decide dispute", { description: errMsg(e) })
      setBusy(false)
    }
  }
  return (
    <Block title="Decision" aside={<span className="text-xs text-muted-foreground">Final</span>}>
      <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Refund returns {$(d.amount)} to the buyer. Reject lets the seller keep it.</p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Act onClick={() => setAction('reject')}>Reject</Act>
          <Act primary onClick={() => setAction('refund')}>Refund</Act>
        </div>
      </div>
      <PDialog
        open={!!action}
        onOpenChange={(o) => !o && !busy && setAction(undefined)}
        title={action === 'refund' ? `Refund ${$(d.amount)} to buyer` : 'Reject dispute'}
        description={action === 'refund' ? 'Money goes back to the buyer, out of the seller’s earnings. Final.' : 'Seller keeps the charge; hold is released. Final.'}
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Field label="Note (optional)" id="ad-reply" hint="Shown to buyer and seller as PayCall's reply.">
            <textarea id="ad-reply" name="reply" maxLength={500} rows={3} className="w-full resize-y border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground" />
          </Field>
          <div className="flex justify-end">
            <Act primary type="submit" disabled={busy}>{busy ? 'Saving…' : action === 'refund' ? 'Confirm refund' : 'Confirm reject'}</Act>
          </div>
        </form>
      </PDialog>
    </Block>
  )
}

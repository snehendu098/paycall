'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { $, ago, per, type Dispute, type Pricing } from '@/lib/api'
import { pc } from '@/lib/pc'
import { Act, Block, Empty, errMsg, Field, Nothing, Page, PDialog, Skel, useApi, Verified } from '@/components/portal'

type Stats = { owners: number; sellers: number; agents: number; listings: number; charged: number; refunded: number; held: number; owed: number; pending: number; paidOut: number }
type Listing = Pricing & { id: string; name: string; seller: string; sellerId: string; verified: boolean; createdAt: string }

export default function AdminPage() {
  const stats = useApi<Stats>('admin', 'stats')
  const queue = useApi<Dispute[]>('admin', 'disputes')
  const eps = useApi<Listing[]>('admin', 'endpoints')
  if (stats.error === 'forbidden') return <Empty title="Admins only" sub="This account isn't a PayCall admin." />
  if (stats.error && !stats.data) return <Page><p className="text-sm text-destructive">Couldn&apos;t load admin: {stats.error}</p></Page>
  return (
    <Page>
      <StatTiles s={stats.data} />
      <Queue list={queue.data} onChanged={() => { queue.reload(); stats.reload() }} />
      <Listings list={eps.data} reload={eps.reload} />
      <Settle onDone={stats.reload} />
    </Page>
  )
}

function StatTiles({ s }: { s?: Stats }) {
  const tiles: [string, string | undefined][] = [
    ['Owners', s && String(s.owners)], ['Sellers', s && String(s.sellers)], ['Agents', s && String(s.agents)], ['Listings', s && String(s.listings)],
    ['Charged', s && $(s.charged)], ['Refunded', s && $(s.refunded)], ['Held in disputes', s && $(s.held)], ['Owed', s && $(s.owed)], ['In flight', s && $(s.pending)], ['Paid out', s && $(s.paidOut)],
  ]
  return (
    <section>
      <h1 className="text-[40px] font-light leading-none tracking-[-0.03em] md:text-5xl">Admin</h1>
      <div className="mt-10 grid grid-cols-2 border-l border-t border-border sm:grid-cols-5">
        {tiles.map(([k, v]) => (
          <div key={k} className="min-w-0 border-b border-r border-border p-4">
            <h2 className="truncate text-xs text-muted-foreground">{k}</h2>
            <div className="mt-2 truncate font-mono text-lg tabular-nums">{v ?? <Skel className="h-6 w-16" />}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

type Deciding = { d: Dispute; action: 'refund' | 'reject' }

function Queue({ list, onChanged }: { list?: Dispute[]; onChanged: () => void }) {
  const [deciding, setDeciding] = useState<Deciding>()
  const [busy, setBusy] = useState(false)

  async function decide(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!deciding) return
    const { d, action } = deciding
    const reply = String(new FormData(ev.currentTarget).get('reply')).trim()
    setBusy(true)
    try {
      await pc('admin', `disputes/${d.id}`, { method: 'POST', body: { action, ...(reply && { reply }) } })
      toast.success(action === 'refund' ? `Refunded ${$(d.amount)}` : 'Dispute rejected')
      setDeciding(undefined)
    } catch (e) {
      toast.error("Couldn't decide dispute", { description: errMsg(e) })
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  return (
    <Block title="Escalated disputes" aside={list && list.length > 0 && <span className="text-xs text-muted-foreground">PayCall decides, final</span>}>
      {!list ? <Skel className="h-24" /> : list.length === 0 ? <Nothing>No escalated disputes.</Nothing> : (
        <ul className="border-t border-border" data-testid="admin-disputes">
          {list.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">Buyer: “{d.reason}”</span>
                  <span className="shrink-0 font-mono">{$(d.amount)}</span>
                </div>
                {d.reply && <div className="mt-1 break-words text-xs text-muted-foreground">Seller: “{d.reply}”</div>}
                <div className="mt-1 truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {d.resource && <><span className="font-mono" title={d.resource}>{d.resource}</span> · </>}
                  charged {ago(d.chargedAt)} · opened {ago(d.createdAt)}{d.escalatedAt && <> · <span className="text-live">escalated {ago(d.escalatedAt)}</span></>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Act onClick={() => setDeciding({ d, action: 'reject' })}>Reject</Act>
                <Act primary onClick={() => setDeciding({ d, action: 'refund' })}>Refund</Act>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PDialog
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(undefined)}
        title={deciding?.action === 'refund' ? `Refund ${$(deciding.d.amount)} to buyer` : 'Reject dispute'}
        description={deciding?.action === 'refund' ? 'Money goes back to the buyer, out of the seller’s earnings. Final.' : 'Seller keeps the charge; hold is released. Final.'}
      >
        <form onSubmit={decide} className="flex flex-col gap-5">
          <Field label="Note (optional)" id="ad-reply" hint="Shown to buyer and seller as PayCall's reply.">
            <textarea id="ad-reply" name="reply" maxLength={500} rows={3} className="w-full resize-y border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground" />
          </Field>
          <div className="flex justify-end">
            <Act primary type="submit" disabled={busy}>{busy ? 'Saving…' : deciding?.action === 'refund' ? 'Refund' : 'Reject'}</Act>
          </div>
        </form>
      </PDialog>
    </Block>
  )
}

function Listings({ list, reload }: { list?: Listing[]; reload: () => void }) {
  const [busy, setBusy] = useState<string>()
  async function toggle(e: Listing) {
    setBusy(e.id)
    try {
      await pc('admin', `endpoints/${e.id}/verified`, { method: 'POST', body: { verified: !e.verified } })
      toast.success(`${e.name} ${e.verified ? 'unverified' : 'verified'}`)
      reload()
    } catch (x) {
      toast.error("Couldn't update listing", { description: errMsg(x) })
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <Block title="Listings">
      {!list ? <Skel className="h-24" /> : list.length === 0 ? <Nothing>No listings yet.</Nothing> : (
        <ul className="border-t border-border">
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-4 border-b border-border py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm"><span className="truncate">{e.name}</span>{e.verified && <Verified />}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {e.seller} · <span className="font-mono">{$(e.price)}{per(e)}</span> · {ago(e.createdAt)}
                </div>
              </div>
              <Act disabled={busy === e.id} aria-pressed={e.verified} onClick={() => toggle(e)} className="w-24">{e.verified ? 'Unverify' : 'Verify'}</Act>
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}

function Settle({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      const r = await pc<{ batchId: string | null }>('admin', 'settle-now', { method: 'POST' })
      toast.success(r.batchId ? `Payout batch ${r.batchId} sent` : 'Nothing due')
      setOpen(false)
      onDone()
    } catch (e) {
      toast.error('Settlement failed', { description: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Block title="Settlement">
      <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Cron runs every 10 min: expires disputes, then pays sellers owed ≥ $0.50 via PayPal.</p>
        <Act onClick={() => setOpen(true)}>Run settlement now</Act>
      </div>
      <PDialog open={open} onOpenChange={(o) => !busy && setOpen(o)} title="Run settlement now?" description="Sends a real PayPal payouts batch to every seller owed ≥ $0.50.">
        <div className="flex justify-end gap-2">
          <Act onClick={() => setOpen(false)} disabled={busy}>Cancel</Act>
          <Act primary onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run now'}</Act>
        </div>
      </PDialog>
    </Block>
  )
}

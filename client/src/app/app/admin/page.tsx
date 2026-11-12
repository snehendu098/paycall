'use client'

import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { $, ago, per, type AdminDispute, type Pricing } from '@/lib/api'
import { pc } from '@/lib/pc'
import { cn } from '@/lib/utils'
import { pathOf, quiet } from '@/components/activity'
import { Act, Block, Empty, errMsg, Nothing, Page, Skel, useApi, Verified } from '@/components/portal'

type Stats = { owners: number; sellers: number; agents: number; listings: number; charged: number; refunded: number; held: number; owed: number; pending: number; paidOut: number }
type Listing = Pricing & { id: string; name: string; seller: string; sellerId: string; verified: boolean; createdAt: string }

export default function AdminPage() {
  const stats = useApi<Stats>('admin', 'stats')
  const queue = useApi<AdminDispute[]>('admin', 'disputes')
  const eps = useApi<Listing[]>('admin', 'endpoints')
  if (stats.error === 'forbidden') return <Empty title="Admins only" sub="This account isn't a PayCall admin." />
  if (stats.error && !stats.data) return <Page><p className="text-sm text-destructive">Couldn&apos;t load admin: {stats.error}</p></Page>
  return (
    <Page>
      <StatTiles s={stats.data} />
      <Queue list={queue.data} />
      <Listings list={eps.data} reload={eps.reload} />
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

function Queue({ list }: { list?: AdminDispute[] }) {
  return (
    <Block title="Escalated disputes" aside={list && list.length > 0 && <span className="text-xs text-muted-foreground">PayCall decides, final</span>}>
      {!list ? <Skel className="h-24" /> : list.length === 0 ? <Nothing>No escalated disputes.</Nothing> : (
        <ul className="border-t border-border" data-testid="admin-disputes">
          {list.map((d) => (
            <li key={d.id} className="border-b border-border last:border-b-0">
              <Link href={`/app/admin/disputes/${d.id}`} className="group flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" title={d.resource ?? undefined}>{d.endpoint ?? pathOf(d.resource)}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground" suppressHydrationWarning>
                    {d.ownerEmail} · {d.seller}{d.escalatedAt && <> · <span className="text-live">escalated {ago(d.escalatedAt)}</span></>}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">{$(d.amount)}</span>
                <span className={cn(quiet, 'shrink-0 group-hover:text-foreground')}>Read more</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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

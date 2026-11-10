'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useEffectEvent, useState } from 'react'
import { cn } from '@/lib/utils'
import { $, ago, short, type Entry } from '@/lib/api'
import { events, pc, type Role } from '@/lib/pc'
import { ease, Nothing, Skel } from '@/components/portal'

const TYPES = ['topup', 'reload', 'charge', 'payout', 'fee'] as const
const byNewest = (a: Entry, b: Entry) => Number(b.id) - Number(a.id) || +new Date(b.createdAt) - +new Date(a.createdAt)

/** History + SSE (named events), dedup by id, newest first. `fresh` = ids that arrived live. */
export function useLedger(role: Role, onEvent?: (e: Entry) => void) {
  const [rows, setRows] = useState<Entry[]>()
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const [live, setLive] = useState(false)
  const fire = useEffectEvent((e: Entry) => onEvent?.(e))

  useEffect(() => {
    const add = (e: Entry[]) => setRows((r) => [...new Map([...(r ?? []), ...e].map((x) => [String(x.id), x])).values()].sort(byNewest))
    // ponytail: last 100 only, paginate via ?before when someone needs more
    pc<Entry[]>(role, 'entries?limit=100').then(add, () => setRows((r) => r ?? []))
    const es = events(role)
    es.onopen = () => setLive(true)
    es.onerror = () => setLive(false)
    for (const t of TYPES)
      es.addEventListener(t, (ev) => {
        const e = JSON.parse((ev as MessageEvent).data) as Entry
        setFresh((f) => new Set(f).add(String(e.id)))
        add([e])
        fire(e)
      })
    return () => es.close()
  }, [role])

  return { rows, fresh, live }
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
  buyer: { topup: 'PayPal top-up', reload: 'Auto-reload', charge: 'Paid call', payout: 'Payout', fee: 'Fee' },
  seller: { topup: 'Top-up', reload: 'Reload', charge: 'Paid call', payout: 'Payout to PayPal', fee: 'Payout fee · 2%' },
}
// sign from the viewer's side
const sign = (role: Role, t: Entry['type']) => (role === 'buyer' ? (t === 'charge' ? -1 : 1) : t === 'charge' ? 1 : -1)

/** Live ledger list. `names` maps agent pubkey → name. */
export function Activity({ role, rows, fresh, names }: { role: Role; rows?: Entry[]; fresh: Set<string>; names?: Record<string, string> }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  if (!rows)
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {[...Array(3)].map((_, i) => <Skel key={i} className="h-9" />)}
      </div>
    )
  if (rows.length === 0)
    return <Nothing>{role === 'buyer' ? 'No activity yet. Top-ups and paid calls show up here live.' : 'No activity yet. Paid calls show up here the moment they settle.'}</Nothing>

  return (
    <ul className="max-h-[520px] overflow-y-auto border-t border-border" data-testid="activity">
      <AnimatePresence initial={false}>
        {rows.map((e) => {
          const s = sign(role, e.type)
          const isNew = fresh.has(String(e.id))
          const who = e.agentPubkey ? (names?.[e.agentPubkey] ?? short(e.agentPubkey)) : null
          return (
            <motion.li
              key={String(e.id)}
              layout="position"
              initial={isNew ? { opacity: 0, y: -8, backgroundColor: 'rgb(143 176 245 / 0.1)' } : false}
              animate={{ opacity: 1, y: 0, backgroundColor: 'rgb(143 176 245 / 0)' }}
              transition={{ duration: 0.5, ease, backgroundColor: { duration: 2.4, ease: 'easeOut' } }}
              className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{label[role][e.type]}</span>
                <span className="block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {who && <span className="font-mono">{who} · </span>}{ago(e.createdAt)}
                </span>
              </span>
              <span className={cn('shrink-0 font-mono text-sm tabular-nums', s > 0 ? 'text-live' : 'text-foreground')}>
                {s > 0 ? '+' : '−'}{$(Math.abs(e.amount))}
              </span>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

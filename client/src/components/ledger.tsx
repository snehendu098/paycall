'use client'

import { useEffect, useState } from 'react'
import { $, ago, api, API, short, type Entry } from '@/lib/api'
import { Card } from './ui'

const TYPES = ['topup', 'reload', 'charge', 'payout', 'fee'] as const
const badge: Record<Entry['type'], string> = {
  topup: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  reload: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  charge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  payout: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  fee: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

// history + SSE append; onEvent → caller refreshes summary
export function Ledger({ apiKey, onEvent }: { apiKey: string; onEvent: () => void }) {
  const [rows, setRows] = useState<Entry[]>([])
  const [live, setLive] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    // dedupe by id, newest first
    const add = (e: Entry[]) =>
      setRows((r) =>
        [...new Map([...r, ...e].map((x) => [String(x.id), x])).values()].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      )
    api<Entry[]>('/entries?limit=50', { key: apiKey }).then(add, () => {})
    const es = new EventSource(`${API}/events?key=${encodeURIComponent(apiKey)}`)
    es.onopen = () => setLive(true)
    es.onerror = () => setLive(false)
    for (const t of TYPES)
      es.addEventListener(t, (ev) => {
        add([JSON.parse((ev as MessageEvent).data)])
        onEvent()
      })
    const iv = setInterval(() => tick((n) => n + 1), 15_000)
    return () => { es.close(); clearInterval(iv) }
  }, [apiKey, onEvent])

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Ledger
          <span className={`inline-block size-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-zinc-400'}`} />
          <span className="font-normal normal-case">{live ? 'live' : 'offline'}</span>
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <span className={`w-16 rounded-full px-2 py-0.5 text-center text-xs font-medium ${badge[e.type]}`}>{e.type}</span>
              <span className="font-mono tabular-nums">{$(e.amount)}</span>
              <span className="hidden font-mono text-xs text-zinc-500 sm:inline">{e.agentPubkey ? short(e.agentPubkey) : ''}</span>
              <span className="ml-auto text-xs text-zinc-500">{ago(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

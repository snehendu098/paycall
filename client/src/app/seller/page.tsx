'use client'

import { useEffect, useState } from 'react'
import { $, api, API, ago, toMicros } from '@/lib/api'
import { btn, btnGhost, Card, Code, Err, Field, Header, input, submit, useData, useSession } from '@/components/ui'
import { Ledger } from '@/components/ledger'

type Payout = { id: string; batchId: string | null; gross: number; net: number; status: 'pending' | 'paid' | 'failed'; createdAt: string }
type Me = {
  seller: { id: string; name: string; paypalEmail: string; paidOut: number; pendingPayout: number }
  earned: number
  owed: number
  payouts: Payout[]
}
type Endpoint = { id: string; name: string; upstreamUrl: string; price: number; createdAt: string }

const status: Record<Payout['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function Seller() {
  const { key, logout } = useSession('seller')
  if (!key) return null
  return <Dashboard apiKey={key} logout={logout} />
}

function Dashboard({ apiKey, logout }: { apiKey: string; logout: () => void }) {
  const { data, err, refresh } = useData<Me>('/sellers/me', apiKey)
  useEffect(() => { if (err === 'invalid api key') logout() }, [err, logout])

  return (
    <>
      <Header who={data?.seller.name ?? 'seller'} onLogout={logout} />
      <Err msg={err} />
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {([['Earned', data.earned], ['Owed', data.owed], ['Paid out', data.seller.paidOut]] as const).map(([l, v]) => (
              <Card key={l}>
                <p className="text-sm text-zinc-500">{l}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{$(v)}</p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Paid to {data.seller.paypalEmail} every 10 min once owed ≥ $0.50 (2% fee).
          </p>
          <Endpoints apiKey={apiKey} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Payouts">
              {data.payouts.length === 0 ? (
                <p className="text-sm text-zinc-500">No payouts yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-zinc-500">
                    <tr><th className="pb-2 font-normal">When</th><th className="pb-2 font-normal">Gross</th><th className="pb-2 font-normal">Net</th><th className="pb-2 font-normal">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.payouts.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 text-zinc-500">{ago(p.createdAt)}</td>
                        <td className="py-2 tabular-nums">{$(p.gross)}</td>
                        <td className="py-2 tabular-nums">{$(p.net)}</td>
                        <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${status[p.status]}`}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Ledger apiKey={apiKey} onEvent={refresh} />
          </div>
        </div>
      )}
    </>
  )
}

function Endpoints({ apiKey }: { apiKey: string }) {
  const { data, err: loadErr, refresh } = useData<Endpoint[]>('/endpoints', apiKey)
  const [err, setErr] = useState<string | null>(null)

  async function create(fd: FormData) {
    setErr(null)
    try {
      await api('/endpoints', {
        key: apiKey,
        body: { name: fd.get('name'), upstreamUrl: fd.get('upstreamUrl'), price: toMicros(String(fd.get('price'))) },
      })
      refresh()
    } catch (e) { setErr((e as Error).message) }
  }

  async function del(id: string) {
    if (!confirm('Delete this endpoint?')) return
    try { await api(`/endpoints/${id}`, { key: apiKey, method: 'DELETE' }); refresh() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <Card title="Endpoints">
      <form onSubmit={submit(create)} className="mb-5 grid gap-2 sm:grid-cols-[1fr_2fr_8rem_auto] sm:items-end">
        <Field label="Name"><input name="name" required placeholder="weather" className={input} /></Field>
        <Field label="Upstream URL (https)"><input name="upstreamUrl" type="url" pattern="https://.*" required placeholder="https://api.example.com" className={input} /></Field>
        <Field label="Price/call ($)"><input name="price" type="number" min="0.000001" step="0.000001" required defaultValue="0.01" className={input} /></Field>
        <button className={btn}>Create</button>
      </form>
      <Err msg={err ?? (loadErr && `Couldn't load endpoints: ${loadErr}`)} />
      {data?.length === 0 && <p className="text-sm text-zinc-500">No endpoints yet.</p>}
      <ul className="space-y-4">
        {data?.map((e) => {
          const url = `${API}/p/${e.id}`
          return (
            <li key={e.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" data-testid="endpoint">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.name}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{$(e.price)}/call</span>
                <span className="truncate text-xs text-zinc-500">→ {e.upstreamUrl}</span>
                <button className={`${btnGhost} ml-auto`} onClick={() => del(e.id)}>Delete</button>
              </div>
              <div className="space-y-2">
                <Code text={url} />
                <Code text={`curl -i ${url}`} />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { $, API } from '@/lib/api'
import { Badge, Input } from '@/components/ds'
import { errMsg, Nothing, Page, Skel } from '@/components/portal'

type Listing = { id: string; name: string; description: string | null; category: string | null; price: number; seller: string; url: string }

function CopyUrl({ url }: { url: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={url}
      onClick={() => navigator.clipboard.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}
      className="h-8 shrink-0 border border-border px-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
    >
      {done ? 'Copied' : 'Copy URL'}
    </button>
  )
}

export default function CatalogPage() {
  const [q, setQ] = useState('')
  const [list, setList] = useState<Listing[]>()
  const [error, setError] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API}/catalog?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((l: Listing[]) => { setList(l); setError('') }, (e) => setError(errMsg(e)))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <Page className="gap-8">
      <section>
        <h1 className="text-[40px] font-light leading-tight tracking-[-0.03em] md:text-5xl">Catalog</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Paid APIs your agents can call. They search this with <span className="font-mono text-foreground">search_paid_apis</span>.
        </p>
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search APIs" aria-label="Search catalog" />
          {list && <span className="shrink-0 font-mono text-xs text-muted-foreground">{list.length} {list.length === 1 ? 'API' : 'APIs'}</span>}
        </div>
        {error && <p className="text-sm text-destructive">Couldn&apos;t load catalog: {error}</p>}
        {!list ? <Skel className="h-48" /> : list.length === 0 ? <Nothing>{q ? 'No matches.' : 'Nothing listed yet.'}</Nothing> : (
          <ul className="divide-y divide-border border border-border bg-card">
            {list.map((l) => (
              <li key={l.id} data-testid="listing" className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm">{l.name}</span>
                    {l.category && <Badge tone="muted">{l.category}</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {l.seller}{l.description && <> · {l.description}</>}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm">{$(l.price)}<span className="text-muted-foreground">/call</span></span>
                <CopyUrl url={l.url} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}

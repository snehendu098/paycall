'use client'

import { useEffect, useState } from 'react'
import { $, API } from '@/lib/api'
import { Badge, Code, Input } from '@/components/ds'
import { errMsg, Nothing, Page, Skel } from '@/components/portal'

type Listing = { id: string; name: string; description: string | null; category: string | null; price: number; seller: string; url: string }

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
    <Page className="gap-10 md:gap-12">
      <section>
        <h1 className="text-[40px] font-light leading-tight tracking-[-0.03em] md:text-5xl">Catalog</h1>
        <p className="mt-3 text-pretty text-sm text-muted-foreground">
          Paid APIs agents can call. Agents find these with the MCP tool <span className="font-mono text-foreground">search_paid_apis</span>.
        </p>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, description, category, seller" aria-label="Search catalog" className="mt-6" />
      </section>
      <section>
        {error && <p className="mb-4 text-sm text-destructive">Couldn&apos;t load catalog: {error}</p>}
        {!list ? <div className="grid gap-4 md:grid-cols-2"><Skel className="h-40" /><Skel className="h-40" /></div> : list.length === 0 ? <Nothing>{q ? 'No matches.' : 'Nothing listed yet.'}</Nothing> : (
          <ul className="grid gap-4 md:grid-cols-2">
            {list.map((l) => (
              <li key={l.id} data-testid="listing" className="flex min-w-0 flex-col gap-3 border border-border bg-card p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{l.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.seller}</div>
                  </div>
                  <span className="shrink-0 font-mono text-sm">{$(l.price)}<span className="text-muted-foreground"> / call</span></span>
                </div>
                {l.category && <Badge tone="muted" className="self-start">{l.category}</Badge>}
                {l.description && <p className="text-pretty text-[13px] leading-relaxed text-muted-foreground">{l.description}</p>}
                <Code text={l.url} className="mt-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:py-2.5 [&_pre]:text-[12px]" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}

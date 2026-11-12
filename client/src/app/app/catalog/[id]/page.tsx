'use client'

import { ArrowLeftIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { $, API, exampleCall, per, routePrice, type Listing } from '@/lib/api'
import { Code } from '@/components/ds'
import { Md } from '@/components/md'
import { CopyChip, errMsg, Page, PageSkeleton, Verified } from '@/components/portal'

const label = 'text-sm text-muted-foreground'

function Detail() {
  const { id } = useParams<{ id: string }>()
  const [l, setL] = useState<Listing | null>()
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`${API}/catalog/${encodeURIComponent(id)}`)
      .then((r) => (r.status === 404 ? null : r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setL, (e) => setError(errMsg(e)))
  }, [id])

  if (error) return <Page><p className="text-sm text-destructive">Couldn&apos;t load listing: {error}</p></Page>
  if (l === undefined) return <PageSkeleton />
  if (l === null) return <Page><Back /><p className="text-sm text-muted-foreground">This listing doesn&apos;t exist or isn&apos;t live yet.</p></Page>

  const hosted = l.mode === 'hosted'
  return (
    <Page className="gap-12 md:gap-14">
      <section className="flex flex-col gap-4">
        <Back />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[40px] font-light leading-tight tracking-[-0.03em] md:text-5xl">{l.name}</h1>
              {l.verified && <Verified />}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              by <span className="text-foreground">{l.seller}</span>
              {l.category && <> · {l.category}</>}
              {' · '}{hosted ? `${l.routes!.length} ${l.routes!.length === 1 ? 'route' : 'routes'}, self-hosted` : 'via PayCall proxy'}
            </p>
          </div>
          <span className="shrink-0 font-mono text-lg tabular-nums">{hosted && <span className="text-sm text-muted-foreground">from </span>}{$(l.price)}<span className="text-sm text-muted-foreground">{per(l)}</span></span>
        </div>
        {l.description && <p className="max-w-[65ch] text-[15px] leading-7 text-foreground/80">{l.description}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className={label}>{hosted ? 'Routes' : 'Paid URL'}</h2>
        {hosted ? (
          <ul data-testid="routes" className="divide-y divide-border border border-border bg-card">
            {l.routes!.map((r) => (
              <li key={`${r.method} ${r.path}`} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2.5 font-mono text-[13px]">
                    <span className="w-12 shrink-0 text-[11px] text-muted-foreground">{r.method}</span>
                    <span className="break-all">{r.path}</span>
                  </div>
                  {r.description && <p className="mt-1 text-xs text-muted-foreground sm:pl-[58px]">{r.description}</p>}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                  <span className="font-mono text-sm">{routePrice(r)}</span>
                  <CopyChip text={r.example ? l.url + r.example : r.url} label="URL" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CopyChip text={l.url} label={l.url.replace(/^https?:\/\//, '')} className="self-start" />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className={label}>Example call</h2>
        <Code text={exampleCall(l)} className="[&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:text-[12px]" />
        <p className="text-xs text-muted-foreground">
          Answers 402 until paid. Agents pay with <span className="font-mono text-foreground">paid_fetch</span> from the PayCall MCP, or <span className="font-mono text-foreground">agent.fetch</span> from the SDK. {hosted && 'Prices are set by the seller’s server.'}
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className={label}>Docs</h2>
        <div className="border-t border-border pt-6"><Md>{l.docs ?? ''}</Md></div>
      </section>
    </Page>
  )
}

const Back = () => <Link href="/app/catalog" className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted-foreground transition-colors hover:text-foreground"><ArrowLeftIcon aria-hidden className="size-3.5" />Catalog</Link>

export default function ListingPage() {
  return <Suspense fallback={<PageSkeleton />}><Detail /></Suspense>
}

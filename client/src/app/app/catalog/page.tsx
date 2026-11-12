'use client'

import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { $, API, per, type Listing } from '@/lib/api'
import { errMsg, Nothing, Page, Skel, Verified } from '@/components/portal'
import { cn } from '@/lib/utils'

const href = (l: Listing) => `/app/catalog/${l.id}`
// "from $0.005/call" for hosted (cheapest route)
const Price = ({ l }: { l: Listing }) => <>{l.mode === 'hosted' && <span className="text-muted-foreground">from </span>}{$(l.price)}<span className="text-muted-foreground">{per(l)}</span></>
const routesLine = (l: Listing) => l.routes && `${l.routes.length} ${l.routes.length === 1 ? 'route' : 'routes'} · ${l.routes.slice(0, 3).map((r) => `${r.method} ${r.path}`).join(', ')}${l.routes.length > 3 ? ', …' : ''}`

const PRICES = [{ label: 'Any price', max: Infinity }, { label: '≤ $0.01', max: 10_000 }, { label: '≤ $0.10', max: 100_000 }, { label: '≤ $1', max: 1_000_000 }]
const spring = { type: 'spring', stiffness: 420, damping: 32 } as const

const SearchIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className={cn('size-4 shrink-0', className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
const Kbd = ({ children }: { children: string }) => <kbd className="border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{children}</kbd>

const copy = (url: string) => navigator.clipboard.writeText(url)

function CopyUrl({ url }: { url: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={url}
      onClick={() => copy(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}
      className="h-8 shrink-0 border border-border px-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
    >
      {done ? 'Copied' : 'Copy URL'}
    </button>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('relative h-8 shrink-0 rounded-full px-3.5 text-xs transition-colors', on ? 'text-background' : 'text-muted-foreground hover:text-foreground')}
    >
      {on && <motion.span layoutId="chip" transition={spring} className="absolute inset-0 rounded-full bg-foreground" />}
      <span className="relative">{children}</span>
    </button>
  )
}

// ⌘/ palette: types into page query, ↑↓ pick, enter opens listing
function Palette({ open, onClose, q, setQ, list }: { open: boolean; onClose: () => void; q: string; setQ: (q: string) => void; list?: Listing[] }) {
  const [i, setI] = useState(0)
  const router = useRouter()
  const top = (list ?? []).slice(0, 8)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setI((n) => (top.length ? (n + (e.key === 'ArrowDown' ? 1 : -1) + top.length) % top.length : 0))
    } else if (e.key === 'Enter' && top[i]) router.push(href(top[i]))
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search catalog"
            onKeyDown={onKey}
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={spring}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center gap-3 px-4">
              <SearchIcon className="text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => { setQ(e.target.value); setI(0) }}
                placeholder="Search paid APIs"
                aria-label="Search paid APIs"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
              />
              <Kbd>esc</Kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto border-t border-border p-2">
              {!list ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</li> : top.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
              ) : top.map((l, n) => (
                <li
                  key={l.id}
                  onMouseEnter={() => setI(n)}
                  onClick={() => router.push(href(l))}
                  className="relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
                >
                  {n === i && <motion.span layoutId="pal-hl" transition={spring} className="absolute inset-0 rounded-lg bg-foreground/[0.06]" />}
                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-sm">{l.name}</span>{l.verified && <Verified />}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.seller}{l.description && <> · {l.description}</>}</div>
                  </div>
                  <span className="relative shrink-0 font-mono text-xs"><Price l={l} /></span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Kbd>↑↓</Kbd> move</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function CatalogPage() {
  const [q, setQ] = useState('')
  const [list, setList] = useState<Listing[]>()
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [max, setMax] = useState(Infinity)
  const [cat, setCat] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API}/catalog?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((l: Listing[]) => { setList(l); setError('') }, (e) => setError(errMsg(e)))
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const close = () => { setOpen(false); trigger.current?.focus() }
  // ponytail: filters run on the ≤50 rows the api returns; move to query params when catalog grows
  const cats = [...new Set((list ?? []).map((l) => l.category).filter((c): c is string => !!c))]
  const shown = list?.filter((l) => (l.maxAmount ?? l.price) <= max && (!cat || l.category === cat))

  return (
    <Page className="gap-8">
      <section>
        <h1 className="text-[40px] font-light leading-tight tracking-[-0.03em] md:text-5xl">Catalog</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Paid APIs your agents can call. They search this with <span className="font-mono text-foreground">search_paid_apis</span>.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <motion.button
          ref={trigger}
          type="button"
          onClick={() => setOpen(true)}
          whileTap={{ scale: 0.99 }}
          className="flex h-12 items-center gap-3 rounded-full border border-border bg-card px-5 text-left text-sm transition-colors hover:border-foreground/30"
        >
          <SearchIcon className="text-muted-foreground" />
          <span className={cn('flex-1 truncate', !q && 'text-muted-foreground/70')}>{q || 'Search APIs'}</span>
          <span className="hidden items-center gap-1 sm:flex"><Kbd>⌘</Kbd><Kbd>/</Kbd></span>
        </motion.button>

        <div className="flex items-center gap-4">
          <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
            {PRICES.map((p) => <Chip key={p.label} on={max === p.max} onClick={() => setMax(p.max)}>{p.label}</Chip>)}
            {cats.length > 0 && <span aria-hidden className="mx-2 h-4 w-px shrink-0 bg-border" />}
            {cats.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{c}</Chip>)}
          </div>
          {shown && <span className="shrink-0 font-mono text-xs text-muted-foreground">{shown.length} {shown.length === 1 ? 'API' : 'APIs'}</span>}
        </div>

        {error && <p className="text-sm text-destructive">Couldn&apos;t load catalog: {error}</p>}
        {!shown ? <Skel className="h-48" /> : shown.length === 0 ? <Nothing>{q || max < Infinity || cat ? 'No matches.' : 'Nothing listed yet.'}</Nothing> : (
          <ul className="divide-y divide-border border border-border bg-card">
            {shown.map((l) => (
              <li key={l.id} data-testid="listing" className="relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-foreground/[0.02] sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {/* stretched link: whole row opens detail, copy button sits above */}
                    <Link href={href(l)} className="truncate text-sm after:absolute after:inset-0">{l.name}</Link>
                    {l.verified && <Verified />}
                    <span className="shrink-0 text-xs text-muted-foreground/70 max-sm:hidden">by {l.seller}</span>
                  </div>
                  {l.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate" title={l.description}>{l.description}</p>}
                  {l.routes && <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">{routesLine(l)}</p>}
                </div>
                <div className="relative flex shrink-0 items-center justify-between gap-4">
                  <span className="font-mono text-sm"><Price l={l} /></span>
                  <CopyUrl url={l.url} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Palette open={open} onClose={close} q={q} setQ={setQ} list={shown} />
    </Page>
  )
}

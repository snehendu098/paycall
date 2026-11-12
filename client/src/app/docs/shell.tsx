'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { ListIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Btn, Frame, Rule } from '@/components/ds'
import { cn } from '@/lib/utils'

// plain data from server layout: bodies stay server-side
export type Index = { title: string; pages: { href: string; title: string; description: string; headings: { id: string; title: string }[] }[] }[]

const mono = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'
const spring = { type: 'spring', stiffness: 420, damping: 32 } as const
const SearchIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className={cn('size-4 shrink-0', className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
const Kbd = ({ children }: { children: string }) => <kbd className="border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{children}</kbd>

export function DocsShell({ index, children }: { index: Index; children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useMotionValueEvent(useScroll().scrollY, 'change', (y) => setScrolled(y > 8))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearch((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const header = (
    <header className={cn('sticky top-0 z-30 transition-[background-color,backdrop-filter] duration-300', scrolled ? 'bg-background/70 backdrop-blur-md' : 'bg-background')}>
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <button type="button" onClick={() => setMenu(true)} aria-label="Open docs menu" className="-ml-1 grid size-8 place-items-center text-muted-foreground hover:text-foreground lg:hidden">
          <ListIcon className="size-5" />
        </button>
        <Link href="/" className="text-lg tracking-tight">PayCall</Link>
        <Link href="/docs" className={cn(mono, 'border-l border-border pl-3 hover:text-foreground')}>Docs</Link>
        <div className="flex flex-1 items-center justify-end gap-3">
          <button
            ref={trigger}
            type="button"
            onClick={() => setSearch(true)}
            aria-label="Search docs"
            className="flex h-8 items-center gap-2 rounded-full border border-border bg-card px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground sm:w-56 sm:px-3.5"
          >
            <SearchIcon />
            <span className="hidden flex-1 text-left sm:inline">Search docs</span>
            <span className="hidden items-center gap-1 sm:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
          </button>
          <Btn href="/login" variant="outline" size="sm" className="max-sm:hidden">Launch app</Btn>
        </div>
      </div>
      <Rule />
    </header>
  )

  return (
    <Frame nav={header}>
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] overflow-y-auto border-r border-border px-4 py-8 lg:block">
          <Sidebar index={index} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setMenu(false)} />
            <motion.nav
              aria-label="Docs"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col border-r border-border bg-card"
              onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}
            >
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                <span className={mono}>Docs</span>
                <button type="button" autoFocus onClick={() => setMenu(false)} aria-label="Close menu" className="grid size-8 place-items-center text-muted-foreground hover:text-foreground">
                  <XIcon className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6">
                <Sidebar index={index} onNavigate={() => setMenu(false)} />
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>

      <Palette open={search} onClose={() => { setSearch(false); trigger.current?.focus() }} index={index} />
    </Frame>
  )
}

function Sidebar({ index, onNavigate }: { index: Index; onNavigate?: () => void }) {
  const path = usePathname()
  return (
    <nav className="flex flex-col gap-7 text-sm">
      {index.map((g) => (
        <div key={g.title}>
          <div className={cn(mono, 'mb-2 px-3')}>{g.title}</div>
          <ul className="flex flex-col">
            {g.pages.map((p) => {
              const on = path === p.href
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    onClick={onNavigate}
                    aria-current={on ? 'page' : undefined}
                    className={cn('relative block px-3 py-1.5 transition-colors', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {on && <motion.span layoutId={onNavigate ? 'doc-nav-m' : 'doc-nav'} transition={spring} className="absolute inset-0 border-l border-foreground bg-foreground/[0.05]" />}
                    <span className="relative">{p.title}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

type Hit = { href: string; title: string; page: string; group: string; heading: boolean }

// ponytail: substring scoring over ~70 entries; fuzzy lib if docs grow a lot
function find(index: Index, q: string): Hit[] {
  const all: (Hit & { text: string })[] = index.flatMap((g) =>
    g.pages.flatMap((p) => [
      { href: p.href, title: p.title, page: p.title, group: g.title, heading: false, text: `${p.title} ${p.description} ${g.title}` },
      ...p.headings.map((h) => ({ href: `${p.href}#${h.id}`, title: h.title, page: p.title, group: g.title, heading: true, text: `${h.title} ${p.title}` })),
    ]),
  )
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return all.filter((h) => !h.heading)
  return all
    .map((h) => {
      const t = h.title.toLowerCase()
      const text = h.text.toLowerCase()
      if (!words.every((w) => text.includes(w))) return { h, s: -1 }
      return { h, s: (t.startsWith(words[0]!) ? 4 : 0) + (words.every((w) => t.includes(w)) ? 2 : 0) + (h.heading ? 0 : 1) }
    })
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.h)
    .slice(0, 12)
}

function Palette({ open, onClose, index }: { open: boolean; onClose: () => void; index: Index }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const hits = find(index, q)
  const go = (h: Hit) => {
    onClose()
    router.push(h.href)
  }
  useEffect(() => {
    list.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [i])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setI((n) => (hits.length ? (n + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length : 0))
    } else if (e.key === 'Enter' && hits[i]) {
      e.preventDefault()
      go(hits[i])
    }
  }
  return (
    <AnimatePresence onExitComplete={() => { setQ(''); setI(0) }}>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search docs"
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
                placeholder="Search docs"
                aria-label="Search docs"
                role="combobox"
                aria-expanded
                aria-controls="docs-hits"
                aria-activedescendant={hits[i] ? `hit-${i}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60"
              />
              <Kbd>esc</Kbd>
            </div>
            <ul ref={list} id="docs-hits" role="listbox" className="max-h-[min(50vh,420px)] overflow-y-auto border-t border-border p-2">
              {hits.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
              ) : (
                hits.map((h, n) => (
                  <li
                    key={h.href}
                    id={`hit-${n}`}
                    data-i={n}
                    role="option"
                    aria-selected={n === i}
                    onMouseMove={() => setI(n)}
                    onClick={() => go(h)}
                    className="relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
                  >
                    {n === i && <motion.span layoutId="docs-hl" transition={spring} className="absolute inset-0 rounded-lg bg-foreground/[0.06]" />}
                    <span aria-hidden className="relative w-4 shrink-0 text-center font-mono text-xs text-muted-foreground">{h.heading ? '#' : '■'}</span>
                    <div className="relative min-w-0 flex-1">
                      <div className="truncate text-sm">{h.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{h.heading ? `${h.group} · ${h.page}` : h.group}</div>
                    </div>
                    {n === i && <span aria-hidden className="relative shrink-0 font-mono text-xs text-muted-foreground">↵</span>}
                  </li>
                ))
              )}
            </ul>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Kbd>↑↓</Kbd> move</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
              <span className="ml-auto flex items-center gap-1.5"><Kbd>⌘K</Kbd> toggle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Right "On this page": highlights the heading nearest the top. */
export function Toc({ headings }: { headings: { id: string; title: string }[] }) {
  const [active, setActive] = useState(headings[0]?.id)
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e)
    const onScroll = () => {
      // last heading above the fold line; bottom of page → last
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4
      const cur = atEnd ? els.at(-1) : els.findLast((e) => e.getBoundingClientRect().top < 120)
      setActive((cur ?? els[0])?.id)
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [headings])
  if (headings.length < 2) return null
  return (
    <nav aria-label="On this page" className="text-[13px]">
      <div className={cn(mono, 'mb-3')}>On this page</div>
      <ul className="flex flex-col border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn('-ml-px block border-l py-1 pl-3 transition-colors', active === h.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {h.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { $ } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { me, pc, type Role } from '@/lib/pc'
import { Rule } from '@/components/ds'
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/shadcn/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu'
import { Skeleton } from '@/components/shadcn/skeleton'

export const ease = [0.22, 1, 0.36, 1] as const
export const pad = 'px-4 sm:px-6 md:px-10 lg:px-12'
export const mono = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ---------- data ----------

/** GET via BFF; `reload` refetches without blanking. `enabled=false` → idle. */
export function useApi<T>(role: Role | 'admin', path: string, enabled = true) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const reload = () => pc<T>(role, path).then((d) => { setData(d); setError('') }, (e) => setError(errMsg(e)))
  useEffect(() => {
    if (enabled) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, role, path])
  return { data, error, reload }
}

export const useUser = () => {
  const s = authClient.useSession()
  return { user: s.data?.user, pending: s.isPending, refetch: s.refetch }
}

// ---------- layout ----------

/** Centered content column, fades in on mount. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className={cn('mx-auto flex w-full max-w-[1040px] flex-col gap-16 px-5 py-12 sm:px-8 md:gap-20 md:py-16', className)}
    >
      {children}
    </motion.div>
  )
}

/** Plain section: muted heading + optional right aside. */
export function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex min-h-8 items-center justify-between gap-4">
        <h2 className="text-sm text-muted-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Centered empty / not-enabled state. */
export function Empty({ title, sub, children }: { title: string; sub: ReactNode; children?: ReactNode }) {
  return (
    <Page className="max-w-md items-center py-20 text-center md:py-28">
      <div>
        <h1 className="text-balance text-[40px] font-light leading-tight tracking-[-0.03em] md:text-5xl">{title}</h1>
        <p className="mt-4 text-pretty text-muted-foreground">{sub}</p>
        {children && <div className="mt-10 flex w-full flex-col items-center">{children}</div>}
      </div>
    </Page>
  )
}

/** Plain-text empty row. */
export function Nothing({ children }: { children: ReactNode }) {
  return <p className="border-t border-border py-6 text-sm text-muted-foreground">{children}</p>
}

export function Skel({ className }: { className?: string }) {
  return <Skeleton className={cn('bg-foreground/[0.05]', className)} />
}

export function PageSkeleton() {
  return (
    <Page>
      <div className="flex flex-col gap-4"><Skel className="h-4 w-20" /><Skel className="h-20 w-64" /><Skel className="h-4 w-72" /></div>
      <Skel className="h-40" />
    </Page>
  )
}

/** Quiet square button. `primary` = light fill, else hairline. */
export function Act({ primary, className, ...rest }: ComponentProps<'button'> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center gap-2 border px-4 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40',
        primary ? 'border-foreground bg-foreground text-background hover:bg-[#f3efe7]' : 'border-border hover:border-foreground/50',
        className,
      )}
      {...rest}
    />
  )
}

/** Sentence-case labelled form row. */
export function Field({ label, id, hint, error, children }: { label: ReactNode; id?: string; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] text-muted-foreground">{label}</label>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : hint && <span className="text-xs text-muted-foreground/80">{hint}</span>}
    </div>
  )
}

// ---------- numbers ----------

/** Money (micros) that counts up from 0 on mount and tweens on change. */
export function Num({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const target = useRef(value)
  // mid-tween: whole cents; at rest: exact
  const text = useTransform(mv, (v) => (Math.abs(v - target.current) < 1 ? $(target.current) : $(Math.round(v / 1e4) * 1e4)))
  useEffect(() => {
    target.current = value
    if (reduce) { mv.set(value); return }
    const c = animate(mv, value, { duration: 1.1, ease })
    return () => c.stop()
  }, [value, reduce, mv])
  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>
}

// ---------- dialog ----------

/** shadcn Dialog: title, body. `locked` blocks esc / outside / close. */
export function PDialog({
  open,
  onOpenChange,
  title,
  description,
  locked,
  wide,
  children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: ReactNode
  locked?: boolean
  wide?: boolean
  children: ReactNode
}) {
  const block = (e: Event) => locked && e.preventDefault()
  return (
    <Dialog open={open} onOpenChange={(o) => (o || !locked) && onOpenChange(o)}>
      <DialogPortal>
        <DialogOverlay className="bg-black/70 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Content
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto outline-none duration-200',
            'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.97] data-open:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.97]',
            wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="border border-border bg-card">
            <div className="flex items-center justify-between gap-3 px-6 pt-5">
              <DialogTitle className="text-[15px] font-normal">{title}</DialogTitle>
              {!locked && (
                <DialogPrimitive.Close className="-mr-2 grid size-8 place-items-center text-muted-foreground transition-colors hover:text-foreground">
                  <XIcon className="size-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              )}
            </div>
            {description ? (
              <DialogDescription className="px-6 pt-1 text-sm leading-relaxed text-muted-foreground">{description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
            <div className="p-6">{children}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

// ---------- nav ----------

const tabs = [
  { href: '/app/spend', label: 'Spend' },
  { href: '/app/earn', label: 'Earn' },
  { href: '/app/catalog', label: 'Catalog' },
]

/** Portal nav: tabs left (animated underline), wordmark centre, user menu right. */
export function PortalNav() {
  const path = usePathname()
  const router = useRouter()
  const { user } = useUser()
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(useScroll().scrollY, 'change', (y) => setScrolled(y > 8))
  const signOut = () => authClient.signOut().then(() => router.push('/login'))
  const [admin, setAdmin] = useState(false)
  const uid = user?.id
  useEffect(() => { if (uid) me().then((m) => setAdmin(m.admin), () => {}) }, [uid])

  return (
    <header className={cn('sticky top-0 z-30 transition-[background-color,backdrop-filter] duration-300', scrolled ? 'bg-background/70 backdrop-blur-md' : 'bg-background')}>
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-stretch gap-3 px-4 md:px-6">
        <nav className="flex items-stretch gap-1" aria-label="Portal">
          {(admin ? [...tabs, { href: '/app/admin', label: 'Admin' }] : tabs).map((t) => {
            const on = path.startsWith(t.href)
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={cn('relative flex items-center px-2 text-sm transition-colors sm:px-3', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {t.label}
                {on && <motion.span layoutId="pc-tab" className="absolute inset-x-0 -bottom-px z-20 h-px bg-foreground" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              </Link>
            )
          })}
        </nav>
        <Link href="/" className="self-center text-lg tracking-tight">PayCall</Link>
        <div className="flex items-center justify-end gap-4">
          <Link href="/docs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Docs</Link>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="group flex h-8 max-w-full items-center gap-2.5 border border-foreground/30 px-1 text-[13px] outline-none transition-colors hover:border-foreground focus-visible:border-foreground data-[state=open]:border-foreground sm:pr-3"
              aria-label="Account"
            >
              <span className="grid size-6 place-items-center bg-foreground font-mono text-[11px] uppercase text-background">{user?.email?.[0] ?? '·'}</span>
              <span className="hidden max-w-[22ch] truncate text-muted-foreground transition-colors group-hover:text-foreground md:inline">{user?.email ?? '…'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-64 border border-border bg-card p-0 ring-0">
              <DropdownMenuLabel className="px-3 py-3">
                <span className={mono}>Signed in as</span>
                <span className="mt-1 block truncate text-[13px] text-foreground">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="mx-0 my-0" />
              <DropdownMenuItem onSelect={signOut} className="cursor-pointer px-3 py-2.5 text-[13px]">
                Sign out
                <span aria-hidden className="ml-auto font-mono text-muted-foreground">→</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Rule />
    </header>
  )
}

// ---------- auth brand moment ----------

/** Compact agent → PayCall → API schematic with a looping packet. */
export function MiniFlow() {
  const reduce = useReducedMotion()
  const nodes = [
    { x: 40, t: 'AGENT', s: 'signs voucher' },
    { x: 200, t: 'PAYCALL', s: '402 proxy' },
    { x: 360, t: 'PAYPAL', s: 'payout' },
  ]
  return (
    <svg viewBox="0 0 400 112" className="w-full max-w-[440px]" aria-hidden>
      <motion.line x1="40" x2="360" y1="36" y2="36" stroke="var(--border)" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease }} />
      {[...Array(33)].map((_, i) => (
        <line key={i} x1={40 + i * 10} x2={40 + i * 10} y1={i % 4 ? 104 : 100} y2="108" stroke="var(--border)" />
      ))}
      {nodes.map((n, i) => (
        <g key={n.t}>
          <rect x={n.x - 18} y="18" width="36" height="36" fill="var(--card)" stroke={i === 2 ? 'var(--live)' : 'var(--muted-foreground)'} strokeOpacity={i === 2 ? 1 : 0.6} />
          <rect x={n.x - 9} y="27" width="18" height="18" fill="none" stroke="var(--border)" />
          <text x={n.x} y="72" textAnchor="middle" className={cn('font-mono text-[9px] tracking-widest', i === 2 ? 'fill-live' : 'fill-foreground')}>{n.t}</text>
          <text x={n.x} y="88" textAnchor="middle" className="fill-muted-foreground font-mono text-[8px]">{n.s}</text>
        </g>
      ))}
      <motion.rect
        y="32" width="8" height="8" fill="var(--live)"
        initial={{ x: 36 }}
        animate={reduce ? { x: 196 } : { x: [36, 196, 196, 356, 356] }}
        transition={{ duration: 3.2, times: [0, 0.4, 0.5, 0.9, 1], repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  )
}

/** PayCall verified seal. */
export const Verified = () => (
  <span title="Verified by PayCall" className="inline-flex shrink-0 text-live">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-3.5"><path d="m12 1.5 2.6 2 3.3-.2.9 3.2 2.7 1.9-1.2 3.1 1.2 3.1-2.7 1.9-.9 3.2-3.3-.2-2.6 2-2.6-2-3.3.2-.9-3.2-2.7-1.9 1.2-3.1L2.5 8.4l2.7-1.9.9-3.2 3.3.2z" /><path d="m8.5 12.2 2.4 2.4 4.6-4.8" fill="none" stroke="var(--background)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span className="sr-only">Verified</span>
  </span>
)

/** Inline mono value that copies on click (paid URLs, keys). */
export function CopyChip({ text, label = text, className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
      className={cn('inline-flex min-w-0 items-center gap-2 border border-border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground', className)}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

'use client'

import Link from 'next/link'
import { MotionConfig, motion, useMotionTemplate, useMotionValue, useMotionValueEvent, useScroll, type HTMLMotionProps } from 'motion/react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Badge as SBadge } from '@/components/shadcn/badge'
import { Button } from '@/components/shadcn/button'
import { Card } from '@/components/shadcn/card'
import { Input as SInput } from '@/components/shadcn/input'
import { Label as SLabel } from '@/components/shadcn/label'
import { Separator } from '@/components/shadcn/separator'
import { Table as STable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table'

const MLink = motion.create(Link)
const mono = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'

/** `+` crosshair mark centered on its position (place inside a relative parent). */
export function Cross({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('pointer-events-none absolute z-10 size-[11px] -translate-1/2', className)}>
      <motion.span
        className="absolute inset-0"
        initial={{ scale: 0, rotate: -90, opacity: 0 }}
        whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted-foreground" />
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-muted-foreground" />
      </motion.span>
    </span>
  )
}

/** Full-bleed horizontal hairline with crosshairs where it meets the frame rails. */
export function Rule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative mx-[calc(var(--rail)*-1)]', className)}>
      <Separator className="bg-border" />
      <Cross className="left-(--rail) top-0" />
      <Cross className="left-[calc(100%-var(--rail))] top-0" />
    </div>
  )
}

/** Page frame: inset vertical rails, optional nav on top; sets reduced-motion policy. */
export function Frame({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative mx-(--rail) flex min-h-svh flex-col border-x border-border">
        {nav}
        <div className="flex-1">{children}</div>
      </div>
    </MotionConfig>
  )
}

/** Sticky nav: centered wordmark, `left`/`right` slots (defaults = landing links). */
export function Nav({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const link = 'hidden text-muted-foreground transition-colors hover:text-foreground sm:inline'
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(useScroll().scrollY, 'change', (y) => setScrolled(y > 8))
  return (
    <header className={cn('sticky top-0 z-30 transition-[background-color,backdrop-filter] duration-300', scrolled ? 'bg-background/70 backdrop-blur-md' : 'bg-background')}>
      <div className="grid h-14 grid-cols-[1fr_auto] items-center gap-3 px-4 sm:grid-cols-[1fr_auto_1fr] md:px-6">
        <div className="hidden min-w-0 truncate sm:block">{left ?? <span className={mono}>x402 · PayPal</span>}</div>
        <Link href="/" className="text-lg tracking-tight">PayCall</Link>
        <nav className="flex items-center justify-end gap-5 text-sm md:gap-7">
          {right ?? (
            <>
              <a href="#" className={link}>Docs</a>
              <a href="#sellers" className={link}>Sellers</a>
              <Btn href="/login" variant="outline" size="sm">Launch app</Btn>
            </>
          )}
        </nav>
      </div>
      <Rule />
    </header>
  )
}

/** Wraps children with L-shaped hairline corner brackets. */
export function Brackets({ children, className, size = 10 }: { children: ReactNode; className?: string; size?: number }) {
  const c = 'pointer-events-none absolute z-10 border-foreground/70'
  const corners = [
    ['-left-px -top-px border-l border-t', -1, -1],
    ['-right-px -top-px border-r border-t', 1, -1],
    ['-bottom-px -left-px border-b border-l', -1, 1],
    ['-bottom-px -right-px border-b border-r', 1, 1],
  ] as const
  return (
    <div className={cn('relative', className)}>
      {corners.map(([k, dx, dy]) => (
        <motion.span
          key={k}
          aria-hidden
          style={{ width: size, height: size }}
          className={cn(c, k)}
          initial={{ opacity: 0, x: dx * 6, y: dy * 6 }}
          whileInView={{ opacity: 1, x: 0, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      {children}
    </div>
  )
}

type BtnProps = {
  children: ReactNode
  variant?: 'primary' | 'outline'
  size?: 'sm' | 'md'
  href?: string
  className?: string
} & Omit<HTMLMotionProps<'button'>, 'children' | 'className'>

/** Square button on shadcn Button. primary = filled label + `+` cell in outline box; `href` renders a Link. */
export function Btn({ children, variant = 'primary', size = 'md', href, className, disabled, type = 'button', ...rest }: BtnProps) {
  const h = size === 'sm' ? 'h-8 text-[13px]' : 'h-11 text-sm'
  const inner =
    variant === 'primary' ? (
      <>
        <span className={cn('flex items-center bg-primary px-5 font-normal text-primary-foreground transition-colors duration-300 group-hover:bg-[#f3efe7]', h)}>{children}</span>
        <span aria-hidden className={cn('grid aspect-square place-items-center overflow-hidden bg-primary text-primary-foreground transition-colors duration-300 group-hover:bg-[#f3efe7]', h)}>
          <motion.span variants={{ rest: { rotate: 0, scale: 1 }, hover: { rotate: 90, scale: 1.15 } }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="text-base leading-none">+</motion.span>
        </span>
      </>
    ) : (
      // md outline matches primary's outer height (44 + 2*3 padding)
      <span className={cn('flex items-center px-5 font-normal', size === 'sm' ? h : 'h-[50px] text-sm')}>{children}</span>
    )
  const cls = cn(
    'h-auto p-0 font-normal',
    variant === 'primary'
      ? 'group gap-[3px] border-foreground/40 bg-transparent p-[3px] hover:border-foreground hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent'
      : 'group border-foreground/30 bg-transparent hover:border-foreground hover:bg-primary hover:text-primary-foreground dark:bg-transparent dark:hover:bg-primary',
    disabled && 'pointer-events-none opacity-40',
    className,
  )
  const m = { initial: 'rest', whileHover: 'hover', whileTap: { scale: 0.98 } } as const
  if (href && disabled)
    return <Button asChild variant="outline" className={cls}><span aria-disabled>{inner}</span></Button>
  if (href)
    return <Button asChild variant="outline" className={cls}><MLink href={href} {...m}>{inner}</MLink></Button>
  return (
    <Button asChild variant="outline" className={cls}>
      <motion.button type={type} disabled={disabled} {...m} {...rest}>{inner}</motion.button>
    </Button>
  )
}

/** Mono bracket label: `[ Live ledger ]`. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(mono, className)}>[&nbsp;{children}&nbsp;]</span>
}

/** Mono square-bullet label: `■ What agents pay for`. */
export function Mark({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn(mono, 'inline-flex items-center gap-2', className)}>
      <span aria-hidden className="size-1.5 bg-foreground" />
      {children}
    </span>
  )
}

/** Section index: `{01}`. */
export function Index({ n, className }: { n: number | string; className?: string }) {
  return <span className={cn('font-mono text-xs text-muted-foreground', className)}>{`{${String(n).padStart(2, '0')}}`}</span>
}

/** Bracketed hairline box (shadcn Card) with optional `[ title ]` and right `aside`. */
export function Panel({ title, aside, children, className, bodyClassName }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Brackets className={className}>
      <Card className="h-full gap-0 border border-border bg-card py-0 text-sm ring-0">
        {(title || aside) && (
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            {title ? <Label>{title}</Label> : <span />}
            {aside}
          </div>
        )}
        <div className={cn('flex-1 p-4', bodyClassName)}>{children}</div>
      </Card>
    </Brackets>
  )
}

/** Mono label over a big light tabular number. */
export function Stat({ label, value, hint, className, ...rest }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string } & Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...rest}>
      <span className={mono}>{label}</span>
      <span className="text-3xl font-light tracking-[-0.03em] tabular-nums md:text-4xl">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** Mono uppercase tag (shadcn Badge); tone `live` = pulsing blue, `muted` = dim. */
export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'live' | 'muted'; className?: string }) {
  return (
    <SBadge
      variant="outline"
      className={cn(
        'gap-1.5 px-1.5 font-mono text-[10px] font-normal uppercase tracking-wider',
        tone === 'live' ? 'border-live/40 text-live' : tone === 'muted' ? 'text-muted-foreground' : 'border-foreground/40',
        className,
      )}
    >
      {tone === 'live' && <span aria-hidden className="pc-pulse size-1.5 bg-live" />}
      {children}
    </SBadge>
  )
}

/** Hairline-row table (shadcn Table). `head` = titles, `rows` = cells, `align` per column. */
export function Table({ head, rows, align, empty = 'Nothing yet' }: { head: ReactNode[]; rows: ReactNode[][]; align?: ('left' | 'right')[]; empty?: ReactNode }) {
  const a = (i: number) => (align?.[i] === 'right' ? 'text-right' : 'text-left')
  return (
    <STable className="text-sm">
      <TableHeader>
        <TableRow className="border-border hover:bg-transparent">
          {head.map((h, i) => (
            <TableHead key={i} className={cn(mono, 'h-9 font-normal', a(i))}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={head.length} className="py-8 text-center text-muted-foreground">{empty}</TableCell>
          </TableRow>
        ) : (
          rows.map((r, i) => (
            <TableRow key={i} className="border-border hover:bg-foreground/[0.03]">
              {r.map((c, j) => (
                <TableCell key={j} className={cn('py-2.5 tabular-nums', a(j))}>{c}</TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </STable>
  )
}

/** Square hairline text input (shadcn Input). */
export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <SInput
      className={cn(
        'h-11 bg-card px-3 text-sm placeholder:text-muted-foreground/60 hover:border-foreground/30 focus-visible:border-foreground focus-visible:ring-0 md:text-sm dark:bg-card',
        className,
      )}
      {...rest}
    />
  )
}

/** Labelled form row with optional hint / error; `id` links label to control. */
export function Field({ label, id, hint, error, children }: { label: ReactNode; id?: string; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SLabel htmlFor={id} className={mono}>{label}</SLabel>
      {children}
      {error ? <span className="text-xs text-destructive">{error}</span> : hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** Mono code block with copy button. */
export function Code({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={cn('relative border border-border bg-card', className)}>
      <pre className="overflow-x-auto p-4 pr-20 font-mono text-[13px] leading-relaxed">{text}</pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
        className={cn(mono, 'absolute right-2 top-2 h-7 border border-border px-2 text-[10px] transition-colors hover:border-foreground hover:text-foreground')}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/** Fade/slide-up once when scrolled into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Stagger container: children `Item`s reveal in sequence (on mount, or `inView`). */
export function Stagger({ children, className, inView, gap = 0.09, delay = 0 }: { children: ReactNode; className?: string; inView?: boolean; gap?: number; delay?: number }) {
  const v = { hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } }
  return inView ? (
    <motion.div className={className} variants={v} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>{children}</motion.div>
  ) : (
    <motion.div className={className} variants={v} initial="hidden" animate="show">{children}</motion.div>
  )
}

/** Child of `Stagger`: fades/slides up with blur. */
export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 20, filter: 'blur(6px)' }, show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } } }}
    >
      {children}
    </motion.div>
  )
}

/** Dark surface with dot grid + cursor-following soft spotlight. */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(-999)
  const y = useMotionValue(-999)
  const bg = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, rgb(232 228 220 / 0.05), transparent 70%)`
  return (
    <div
      className={cn('pc-dots relative isolate', className)}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set(e.clientX - r.left); y.set(e.clientY - r.top) }}
      onPointerLeave={() => { x.set(-999); y.set(-999) }}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: bg }} />
      {children}
    </div>
  )
}

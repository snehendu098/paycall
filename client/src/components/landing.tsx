'use client'

import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Badge, Brackets, Label, Spotlight } from '@/components/ds'

const ease = [0.22, 1, 0.36, 1] as const
const draw = (delay = 0) => ({
  initial: { pathLength: 0, opacity: 0 },
  whileInView: { pathLength: 1, opacity: 1 },
  viewport: { once: true },
  transition: { pathLength: { duration: 1.2, delay, ease }, opacity: { duration: 0.2, delay } },
})

// ---------- hero: looping x402 flow ----------

type Row = { t: string; dim?: boolean; tone?: 'warn' | 'ok' | 'sig'; type?: boolean }
const rowsFor = (n: number): Row[] => {
  const v = 7 + n
  const bal = (4.93 - n * 0.01).toFixed(2)
  return [
    { t: '$ claude › "weather in SF right now?"', dim: true, type: true },
    { t: '→ GET  /p/wx_7f3a/weather?city=SF', type: true },
    { t: '← 402  Payment Required · $0.01', tone: 'warn' },
    { t: '       x402 · payTo seller_wx · scheme voucher', dim: true },
    { t: `→ PAYMENT-SIGNATURE  voucher #${v}`, tone: 'sig', type: true },
    { t: `       ed25519 · cumulative $${(v * 0.01).toFixed(2)} · sig 9f2c…a41e`, dim: true },
    { t: `← 200  OK · paid $0.01 · balance $${bal}`, tone: 'ok' },
    { t: '       {"city":"SF","temp_c":17,"sky":"fog"}', dim: true },
  ]
}
// which node the packet sits on per row: 0 agent, 1 proxy, 2 api
const hop = [0, 1, 0, 0, 1, 2, 0, 0]
const nodes = [
  { x: 40, label: 'AGENT', sub: 'claude · mcp' },
  { x: 240, label: 'PAYCALL', sub: '402 proxy' },
  { x: 440, label: 'API', sub: 'weather' },
]

export function HeroFlow() {
  const reduce = useReducedMotion()
  // step = rows fully shown; ch = chars typed of row `step`
  const [{ step, ch }, setPos] = useState({ step: 0, ch: 0 })
  const [loop, setLoop] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const rows = rowsFor(loop % 40)
  const shown = reduce ? rows.length : step

  useEffect(() => {
    if (reduce || !inView) return
    const r = rows[step]
    const next = () => {
      if (!r) { setPos({ step: 0, ch: 0 }); setLoop((l) => l + 1) }
      else if (r.type && ch < r.t.length) setPos({ step, ch: ch + 1 })
      else setPos({ step: step + 1, ch: 0 })
    }
    const wait = !r ? 3400 : r.type ? (ch === 0 ? 420 : ch < r.t.length ? 24 : 260) : r.dim ? 140 : 520
    const id = setTimeout(next, wait)
    return () => clearTimeout(id)
  }, [step, ch, reduce, inView, rows])

  const at = hop[Math.max(0, Math.min(shown + (ch > 0 ? 1 : 0), rows.length) - 1)] ?? 0
  const tone = { warn: 'text-foreground', ok: 'text-live', sig: 'text-foreground' }

  return (
    <div ref={ref} className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Label>Live call</Label>
        <Badge tone="live">x402 · sandbox</Badge>
      </div>

      {/* flow schematic */}
      <div className="border-b border-border px-5 py-6">
        <svg viewBox="0 0 480 120" className="w-full" aria-hidden>
          <motion.line x1="40" y1="44" x2="440" y2="44" stroke="var(--border)" {...draw()} />
          {[...Array(41)].map((_, i) => (
            <line key={i} x1={40 + i * 10} x2={40 + i * 10} y1={i % 5 ? 92 : 88} y2="96" stroke="var(--border)" />
          ))}
          {nodes.map((n, i) => (
            <g key={n.label}>
              <rect x={n.x - 22} y="22" width="44" height="44" fill="var(--card)" stroke={at === i ? 'var(--foreground)' : 'var(--muted-foreground)'} strokeOpacity={at === i ? 1 : 0.5} />
              <rect x={n.x - 12} y="32" width="24" height="24" fill="none" stroke="var(--border)" />
              <text x={n.x} y="84" textAnchor="middle" className="fill-foreground font-mono text-[9px] tracking-widest">{n.label}</text>
              <text x={n.x} y="112" textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">{n.sub}</text>
            </g>
          ))}
          <motion.rect
            y="40" width="8" height="8" fill="var(--live)"
            initial={false}
            animate={{ x: nodes[at].x - 4 }}
            transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          />
        </svg>
      </div>

      {/* terminal */}
      <div className="flex-1 overflow-hidden px-5 py-5 font-mono text-[11px] leading-[22px] sm:text-[12.5px] sm:leading-[24px]">
        {rows.slice(0, shown).map((r, i) => (
          <motion.div
            key={`${loop}-${i}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease }}
            className={`overflow-hidden text-ellipsis whitespace-pre ${r.dim ? 'text-muted-foreground' : r.tone ? tone[r.tone] : 'text-foreground'}`}
          >
            {r.t}
          </motion.div>
        ))}
        {shown < rows.length && (
          <div className={`whitespace-pre ${rows[shown].dim ? 'text-muted-foreground' : 'text-foreground'}`}>
            {rows[shown].type ? rows[shown].t.slice(0, ch) : ''}
            <span className="pc-blink inline-block h-3.5 w-[7px] translate-y-0.5 bg-foreground" />
          </div>
        )}
      </div>

      {/* ledger: newest settled vouchers */}
      <div className="border-t border-border font-mono text-[11px]">
        <div className="flex items-center justify-between px-5 py-2.5">
          <Label>Ledger</Label>
          <span className="text-muted-foreground">settled · batched to PayPal</span>
        </div>
        <ul className="h-[128px] overflow-hidden px-5">
          <AnimatePresence initial={false}>
            {[0, 1, 2, 3].map((k) => {
              const id = 7 + (loop % 40) - (shown > 6 ? 0 : 1) - k
              return (
                <motion.li
                  key={id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: k === 0 ? 1 : 0.75 - k * 0.15, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className="grid grid-cols-[48px_1fr_auto_auto] gap-4 border-t border-border/60 py-1.5 tabular-nums"
                >
                  <span className="text-muted-foreground">#{id}</span>
                  <span className="truncate">GET /weather</span>
                  <span>$0.01</span>
                  <span className={k === 0 ? 'text-live' : 'text-muted-foreground'}>paid</span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </div>

      <div className="grid grid-cols-3 border-t border-border font-mono text-[11px]">
        {[
          ['voucher', `#${7 + (loop % 40) - (shown > 4 ? 0 : 1)}`],
          ['balance', `$${(4.93 - (loop % 40) * 0.01 + (shown > 6 ? 0 : 0.01)).toFixed(2)}`],
          ['card prompts', '0'],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 border-r border-border px-5 py-3 last:border-r-0">
            <span className="uppercase tracking-wider text-muted-foreground">{k}</span>
            <span className="relative block h-5 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={v} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: 0.3, ease }} className="block text-sm text-foreground">
                {v}
              </motion.span>
            </AnimatePresence>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- {01} buyers: balance meter ----------
// svg on an 8-unit grid; $0..$10 maps to y 248..8 (24 units per $)

const yb = (v: number) => 248 - v * 24
const lbl = 'font-mono text-[9px] tracking-wider'

function PanelHead({ title, aside }: { title: string; aside: ReactNode }) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-border px-4 sm:px-6">
      <Label>{title}</Label>
      {aside}
    </div>
  )
}

function PanelFoot({ cells }: { cells: [ReactNode, ReactNode, boolean?][] }) {
  return (
    <div className="grid grid-cols-2 border-t border-border font-mono text-[11px]">
      {cells.map(([k, v, live], i) => (
        <div key={i} className="flex h-10 items-center justify-between gap-3 border-r border-border px-4 last:border-r-0 sm:px-6">
          <span className="truncate">{k}</span>
          <span className={live ? 'text-live' : 'text-muted-foreground'}>{v}</span>
        </div>
      ))}
    </div>
  )
}

export function BalanceMeter() {
  const reduce = useReducedMotion()
  const bal = useMotionValue(6)
  const scaleY = useTransform(bal, (v) => v / 10)
  const label = useTransform(bal, (v) => `$${v.toFixed(2)}`)
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref)
  useEffect(() => {
    if (reduce || !inView) return
    const c = animate(bal, [9.4, 1.9, 1.9, 9.4], { duration: 8, times: [0, 0.8, 0.86, 0.92], repeat: Infinity, ease: 'linear' })
    return () => c.stop()
  }, [bal, reduce, inView])

  const rows: [string, string, boolean?][] = [
    ['Reload below', '$2.00', true],
    ['Auto top-up', '+$7.50'],
    ['Daily cap', '$5.00'],
    ['Max / call', '$0.05'],
    ['Agents', '2 active'],
  ]
  return (
    <Brackets className="border border-border bg-card"><Spotlight>
      <PanelHead title="Prepaid balance" aside={<Badge tone="live">auto-reload on</Badge>} />
      <div className="grid items-center gap-8 p-6 sm:grid-cols-[auto_1fr] sm:gap-10 sm:p-8">
        {/* chart: label lane 0-32 · axis 40 · bar 56-120 · annotation lane 128-192 */}
        <svg ref={ref} viewBox="0 0 192 256" className="mx-auto w-40 sm:w-44 lg:w-48" aria-hidden>
          {[...Array(11)].map((_, v) => (
            <line key={v} x1={v % 2 ? 36 : 32} x2="40" y1={yb(v)} y2={yb(v)} stroke={v % 2 ? 'var(--border)' : 'var(--muted-foreground)'} />
          ))}
          {[0, 2, 4, 6, 8, 10].map((v) => (
            <text key={v} x="26" y={yb(v) + 3} textAnchor="end" className={`fill-muted-foreground ${lbl}`}>${v}</text>
          ))}
          <motion.line x1="40" x2="40" y1="8" y2="248" stroke="var(--muted-foreground)" strokeOpacity=".6" {...draw()} />
          <rect x="56" y="8" width="64" height="240" fill="var(--foreground)" fillOpacity=".04" />
          <motion.rect x="56" y="8" width="64" height="240" fill="var(--foreground)" fillOpacity=".88" style={{ scaleY, originY: 1, transformBox: 'fill-box' }} />
          {/* annotations: own lane, never across the bar */}
          <motion.line x1="128" x2="192" y1={yb(2)} y2={yb(2)} stroke="var(--live)" strokeWidth="1.5" {...draw(0.4)} />
          <text x="128" y={yb(2) - 8} className={`fill-live ${lbl}`}>RELOAD</text>
          <motion.line x1="128" x2="192" y1={yb(9.4)} y2={yb(9.4)} stroke="var(--muted-foreground)" strokeDasharray="2 3" {...draw(0.6)} />
          <text x="128" y={yb(9.4) + 16} className={`fill-muted-foreground ${lbl}`}>TOP-UP</text>
        </svg>

        <div className="min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Balance</span>
          <motion.div className="mt-2 font-mono text-4xl font-light tabular-nums tracking-tight">{label}</motion.div>
          <ul className="mt-6 border-t border-border font-mono text-[11px]">
            {rows.map(([k, v, live]) => (
              <li key={k} className="flex h-10 items-center justify-between gap-4 border-b border-border">
                <span className="uppercase tracking-wider text-muted-foreground">{k}</span>
                <span className={`tabular-nums ${live ? 'text-live' : 'text-foreground'}`}>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <PanelFoot cells={[['claude-desktop', 'ACTIVE', true], ['scraper-bot', 'PAUSED']]} />
    </Spotlight></Brackets>
  )
}

// ---------- {02} sellers: proxy between agent and API ----------
// 480x256 grid, 32 padding; boxes 96x64; row 1 y 32-96, row 2 y 160-224

function Node({ x, y, title, sub, tone = 'muted', nested }: { x: number; y: number; title: string; sub: string; tone?: 'muted' | 'fg' | 'live'; nested?: boolean }) {
  const stroke = tone === 'fg' ? 'var(--foreground)' : tone === 'live' ? 'var(--live)' : 'var(--muted-foreground)'
  return (
    <g>
      <motion.rect x={x} y={y} width="96" height="64" fill="var(--card)" stroke={stroke} strokeOpacity={tone === 'muted' ? 0.6 : 1} {...draw()} />
      {nested && <motion.rect x={x + 8} y={y + 8} width="80" height="48" fill="none" stroke="var(--border)" {...draw(0.2)} />}
      <text x={x + 48} y={y + 30} textAnchor="middle" className={`${tone === 'live' ? 'fill-live' : 'fill-foreground'} font-mono text-[10px] tracking-widest`}>{title}</text>
      <text x={x + 48} y={y + 46} textAnchor="middle" className={`fill-muted-foreground ${lbl}`}>{sub}</text>
    </g>
  )
}

function Wire({ x1, x2, y, label, below, back, d = 0 }: { x1: number; x2: number; y: number; label: string; below?: boolean; back?: boolean; d?: number }) {
  return (
    <g>
      <motion.line x1={back ? x2 : x1} x2={back ? x1 : x2} y1={y} y2={y} stroke={back ? 'var(--muted-foreground)' : 'var(--foreground)'}
        strokeWidth={back ? 1 : 1.5} strokeDasharray={back ? '3 3' : undefined} {...draw(d)} />
      {/* label 8 units off the line */}
      <text x={(x1 + x2) / 2} y={below ? y + 15 : y - 8} textAnchor="middle" className={`fill-muted-foreground ${lbl}`}>{label}</text>
    </g>
  )
}

export function ProxySchematic() {
  const reduce = useReducedMotion()
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref)
  const [calls, setCalls] = useState(1284)
  useEffect(() => {
    if (reduce || !inView) return
    const id = setInterval(() => setCalls((c) => c + 1), 1600) // one per packet loop
    return () => clearInterval(id)
  }, [reduce, inView])
  return (
    <Brackets className="border border-border bg-card"><Spotlight>
      <PanelHead
        title="Paid proxy"
        aside={<span className="font-mono text-[11px] tabular-nums text-muted-foreground">earned <span className="text-live">${(calls * 0.01).toFixed(2)}</span></span>}
      />
      <div className="p-4 sm:p-6">
        <svg ref={ref} viewBox="0 0 480 256" className="w-full" aria-hidden>
          <Node x={32} y={32} title="AGENT" sub="claude" />
          <Node x={192} y={32} title="PAYCALL" sub="/p/wx_7f3a" tone="fg" nested />
          <Node x={352} y={32} title="YOUR API" sub="weather" />
          {/* wires: ±8 around row centre y=64 */}
          <Wire x1={128} x2={192} y={56} label="GET" d={0.3} />
          <Wire x1={128} x2={192} y={72} label="402" below back d={0.4} />
          <Wire x1={288} x2={352} y={56} label="HTTPS" d={0.5} />
          <Wire x1={288} x2={352} y={72} label="200" below back d={0.6} />
          <motion.rect y="52" width="8" height="8" fill="var(--live)" animate={{ x: [128, 184] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }} />
          <motion.rect y="52" width="8" height="8" fill="var(--foreground)" animate={{ x: [288, 344] }} transition={{ duration: 1.6, delay: 0.8, repeat: Infinity, ease: 'linear' }} />
          {/* row 2: voucher under agent, payout under api */}
          <motion.line x1="80" x2="80" y1="96" y2="160" stroke="var(--muted-foreground)" strokeDasharray="3 3" {...draw(0.6)} />
          <text x="88" y="131" className={`fill-muted-foreground ${lbl}`}>signs</text>
          <Node x={32} y={160} title="VOUCHER #7" sub="ed25519" />
          <motion.path d="M240 96 V192 H352" fill="none" stroke="var(--live)" strokeWidth="1.5" {...draw(0.7)} />
          <text x="296" y="184" textAnchor="middle" className={`fill-muted-foreground ${lbl}`}>every 10 min</text>
          <text x="296" y="207" textAnchor="middle" className={`fill-muted-foreground ${lbl}`}>once ≥ $0.50</text>
          <Node x={352} y={160} title="PAYPAL" sub="2% fee" tone="live" />
        </svg>
      </div>
      <PanelFoot cells={[['unpaid calls', '402'], ['added latency', '~40 ms']]} />
    </Spotlight></Brackets>
  )
}

// ---------- {03} how it works: step glyphs ----------

export function StepGlyph({ n }: { n: 1 | 2 | 3 }) {
  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[260px]" aria-hidden>
      <line x1="0" x2="200" y1="110" y2="110" stroke="var(--border)" />
      {[...Array(21)].map((_, i) => (
        <line key={i} x1={i * 10} x2={i * 10} y1={i % 5 ? 106 : 102} y2="110" stroke="var(--border)" />
      ))}
      {n === 1 && (
        <>
          <motion.rect x="20" y="10" width="80" height="80" fill="none" stroke="var(--foreground)" {...draw()} />
          <text x="60" y="56" textAnchor="middle" className="fill-foreground font-mono text-[20px]">402</text>
          <motion.path d="M100 50 H180" fill="none" stroke="var(--muted-foreground)" strokeDasharray="3 3" {...draw(0.3)} />
          <text x="180" y="44" textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">$0.01</text>
        </>
      )}
      {n === 2 && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.rect key={i} x={20 + i * 22} y={30 - i * 10} width="80" height="60" fill="var(--card)"
              stroke={i === 2 ? 'var(--foreground)' : 'var(--muted-foreground)'} strokeOpacity={i === 2 ? 1 : 0.5} {...draw(i * 0.2)} />
          ))}
          <text x="104" y="48" textAnchor="middle" className="fill-foreground font-mono text-[11px]">#7</text>
          <text x="104" y="64" textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">Σ $0.07</text>
          <text x="190" y="44" textAnchor="end" className="fill-muted-foreground font-mono text-[9px]">ed25519</text>
        </>
      )}
      {n === 3 && (
        <>
          {[18, 34, 50, 66, 82].map((y, i) => (
            <motion.path key={y} d={`M10 ${y} C 70 ${y}, 80 50, 120 50`} fill="none" stroke="var(--muted-foreground)" strokeOpacity=".6" {...draw(i * 0.08)} />
          ))}
          <motion.rect x="120" y="30" width="60" height="40" fill="none" stroke="var(--live)" {...draw(0.5)} />
          <text x="150" y="54" textAnchor="middle" className="fill-live font-mono text-[9px] tracking-widest">PAYPAL</text>
        </>
      )}
    </svg>
  )
}

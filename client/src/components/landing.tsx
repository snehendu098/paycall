'use client'

import type { COBEOptions } from 'cobe'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Label } from '@/components/ds'
import { Globe } from '@/components/shadcn/globe'

const cities: [number, number][] = [
  [37.7749, -122.4194], // 0 SF
  [40.7128, -74.006], // 1 NYC
  [51.5074, -0.1278], // 2 London
  [52.52, 13.405], // 3 Berlin
  [12.9716, 77.5946], // 4 Bangalore
  [1.3521, 103.8198], // 5 Singapore
  [35.6762, 139.6503], // 6 Tokyo
  [-23.5505, -46.6333], // 7 São Paulo
  [-33.8688, 151.2093], // 8 Sydney
  [43.6532, -79.3832], // 9 Toronto
  [48.8566, 2.3522], // 10 Paris
]
const warm: [number, number, number] = [232 / 255, 228 / 255, 220 / 255]
const blue: [number, number, number] = [143 / 255, 176 / 255, 245 / 255]
const base = 0.035

const config: COBEOptions = {
  width: 1200,
  height: 1200,
  onRender: () => {},
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.25,
  dark: 1,
  diffuse: 1.2,
  mapSamples: 16000,
  mapBrightness: 4,
  baseColor: [0.26, 0.26, 0.26],
  markerColor: warm,
  glowColor: [0.16, 0.155, 0.15],
  markers: cities.map((location) => ({ location, size: base })),
}

// from = payer city, to = payee city
type Feed = { amt: string; what: string; who: string; from: number; to: number; usd: number }
const feed: Feed[] = [
  { amt: '$0.01', what: 'Weather API', who: 'claude-desktop', from: 0, to: 2, usd: 0.01 },
  { amt: '$0.02', what: 'Geocode API', who: 'research-agent', from: 3, to: 1, usd: 0.02 },
  { amt: '$0.05', what: 'Search API', who: 'scraper-bot', from: 4, to: 6, usd: 0.05 },
  { amt: '+$10.00', what: 'auto-reload', who: 'PayPal wallet', from: 1, to: 0, usd: 0 },
  { amt: '$0.01', what: 'Weather API', who: 'trip-planner', from: 6, to: 8, usd: 0.01 },
  { amt: '$0.03', what: 'News API', who: 'claude-desktop', from: 10, to: 9, usd: 0.03 },
  { amt: '$3.43', what: 'payout → seller', who: 'PayPal', from: 2, to: 7, usd: 0 },
  { amt: '$0.02', what: 'Geocode API', who: 'support-bot', from: 5, to: 3, usd: 0.02 },
  { amt: '$0.01', what: 'Weather API', who: 'research-agent', from: 8, to: 0, usd: 0.01 },
]
const EVERY = 1800
const FLY = 1100 // ms for the dot to travel an arc
const LIFE = 2400

// cobe shader math: world m = Lᵀ·view, globe radius 0.8 of half-size
const D2R = Math.PI / 180
const toVec = ([lat, lon]: [number, number]) => {
  const a = lat * D2R, b = lon * D2R - Math.PI, c = Math.cos(a)
  return [-c * Math.cos(b), Math.sin(a), c * Math.sin(b)] as const
}
const vecs = cities.map(toVec)
function view(m: readonly number[], phi: number, theta: number) {
  const c = Math.cos(theta), e = Math.sin(theta), d = Math.cos(phi), f = Math.sin(phi)
  const [x, y, z] = m as [number, number, number]
  return [d * x + f * z, f * e * x + c * y - d * e * z, -f * c * x + e * y + d * c * z] as const
}
/** great-circle arc lifted off the surface, `n` samples in world space */
function arc(a: readonly number[], b: readonly number[], n = 48) {
  const dot = Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!)
  const w = Math.acos(dot), s = Math.sin(w) || 1
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s
    const lift = 1 + Math.sin(Math.PI * t) * (0.06 + 0.22 * (w / Math.PI))
    return [0, 1, 2].map((j) => (k1 * a[j]! + k2 * b[j]!) * lift)
  })
}
const arcs = feed.map((f) => arc(vecs[f.from]!, vecs[f.to]!))

/** Live network hero: cobe globe + streaming payment cards; pulses the matching city. */
export function NetworkGlobe() {
  const reduce = useReducedMotion()
  const [n, setN] = useState(2) // index of newest card
  const pulse = useRef<{ city: number; at: number }[]>([])
  const live = useRef<{ i: number; at: number }[]>([])
  const overlay = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setN((k) => k + 1), EVERY)
    return () => clearInterval(id)
  }, [reduce])

  // new card → arc payer→payee; pulse payer now, payee when the dot lands
  useEffect(() => {
    const i = n % feed.length, f = feed[i]!, at = performance.now()
    live.current = [...live.current.filter((l) => at - l.at < LIFE), { i, at }]
    pulse.current = [...pulse.current.slice(-6), { city: f.from, at }, { city: f.to, at: at + FLY }]
  }, [n])

  // runs inside cobe's rAF: marker bumps + arc overlay
  const onFrame = useCallback((state: Record<string, unknown>) => {
    const now = performance.now()
    state.markers = cities.map((location, i) => {
      const p = pulse.current.findLast((q) => q.city === i && q.at <= now)
      const k = p ? Math.max(0, 1 - (now - p.at) / 1200) : 0
      return { location, size: base + 0.07 * k * k, color: k > 0 ? blue : warm }
    })
    const cv = overlay.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const W = cv.clientWidth * 2
    if (cv.width !== W) { cv.width = W; cv.height = W }
    ctx.clearRect(0, 0, W, W)
    const phi = state.phi as number, theta = (state.theta as number | undefined) ?? config.theta
    const px = (m: number[]) => {
      const [x, y, z] = view(m, phi, theta)
      return { x: (W / 2) * (1 + 0.8 * x), y: (W / 2) * (1 - 0.8 * y), on: z > 0 }
    }
    // stroke visible runs of pts[a..b]
    const path = (pts: ReturnType<typeof px>[], a: number, b: number) => {
      ctx.beginPath()
      let pen = false
      for (let j = a; j <= b; j++) {
        const p = pts[j]!
        if (!p.on) { pen = false; continue }
        if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y)
        pen = true
      }
      ctx.stroke()
    }
    ctx.lineCap = 'round'
    for (const l of live.current) {
      const age = now - l.at
      if (age > LIFE) continue
      const pts = arcs[l.i]!.map(px), N = pts.length - 1
      const fade = Math.min(1, age / 200) * Math.min(1, (LIFE - age) / 500)
      // dotted route + travelling dot only (no solid tail over the dots)
      const head = Math.min(1, age / FLY), h = Math.round(head * N)
      ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.strokeStyle = `rgb(143 176 245 / ${0.6 * fade})`
      path(pts, 0, N)
      const p = pts[h]!
      if (head < 1 && p.on) {
        ctx.fillStyle = 'rgb(232 228 220)'; ctx.shadowColor = 'rgb(143 176 245)'; ctx.shadowBlur = 12
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
      }
    }
  }, [])

  const cards = [n - 2, n - 1, n].filter((i) => i >= 0)
  const settled = 124.08 + feed.slice(0, n + 1).reduce((s, f) => s + f.usd, 0) + Math.floor(n / feed.length) * 0.15
  return (
    <div className="relative flex h-full min-h-[420px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 pt-6 md:px-8 md:pt-8">
        <Label>Live network</Label>
        <Badge tone="live">x402 · sandbox</Badge>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-6 py-6 md:px-10">
        <div className="relative aspect-square w-full max-w-[640px]">
          <Globe config={config} speed={reduce ? 0 : 0.0025} onFrame={onFrame} className="max-w-none" />
          <canvas ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
        </div>
      </div>

      {/* payment cards: newest at bottom; overlay on md+, below globe on mobile */}
      <div aria-live="polite" className="pointer-events-none flex flex-col gap-2 px-6 pb-6 md:absolute md:bottom-16 md:left-8 md:w-[280px] md:p-0">
        <AnimatePresence initial={false} mode="popLayout">
          {cards.map((i) => {
            const c = feed[i % feed.length]!
            return (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 border border-border bg-card/90 px-3 py-2.5 backdrop-blur-sm"
              >
                <span aria-hidden className="size-1.5 shrink-0 bg-live" />
                <span className="text-lg font-light tabular-nums tracking-tight">{c.amt}</span>
                <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {c.what} · {c.who}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <div className="flex h-12 items-center justify-between gap-4 border-t border-border px-6 font-mono text-[11px] uppercase tracking-wider text-muted-foreground md:px-8">
        <span className="tabular-nums">Calls today {(12408 + n).toLocaleString('en-US')}</span>
        <span className="tabular-nums">Settled ${settled.toFixed(2)}</span>
      </div>
    </div>
  )
}

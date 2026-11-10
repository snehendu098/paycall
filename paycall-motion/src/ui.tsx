import { loadFont as geist } from '@remotion/google-fonts/Geist'
import { loadFont as geistMono } from '@remotion/google-fonts/GeistMono'
import type { CSSProperties, FC, ReactNode } from 'react'
import { AbsoluteFill, Easing, interpolate, interpolateColors, spring, useCurrentFrame } from 'remotion'

export const sans = geist('normal', { weights: ['300', '400'], subsets: ['latin'] }).fontFamily
export const mono = geistMono('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily

// landing tokens
export const C = { panel: '#111111', line: '#292929', text: '#e8e4dc', muted: '#9a958d', dim: '#55524d', live: '#8fb0f5' }
export const FPS = 30

export const ez = Easing.bezier(0.22, 1, 0.36, 1)
/** eased 0→1 (or from→to) between frames a..b, clamped */
export const tw = (f: number, a: number, b: number, from = 0, to = 1, easing = ez) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing })
/** spring 0→1 starting at frame `at` */
export const sp = (f: number, at: number, damping = 18, stiffness = 120) =>
  spring({ frame: Math.max(0, f - at), fps: FPS, config: { damping, stiffness, mass: 1 } })
export const mix = (p: number, a: string, b: string) => interpolateColors(Math.min(1, Math.max(0, p)), [0, 1], [a, b])
export const usd = (v: number) => `$${v.toFixed(2)}`

/** seamless loop: frames 0..N crossfade from scene's tail (D..D+N) */
export function Loop({ D, N = 15, Scene }: { D: number; N?: number; Scene: FC<{ f: number }> }) {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: C.panel }}>
      <Scene f={f} />
      {f < N && <AbsoluteFill style={{ opacity: 1 - f / N }}><Scene f={f + D} /></AbsoluteFill>}
    </AbsoluteFill>
  )
}

/** panel bg + dot grid; content gets periodic gentle push-in (period D keeps loop exact) */
export function Stage({ f, D, children }: { f: number; D: number; children: ReactNode }) {
  const s = 1 + 0.01 * (0.5 - 0.5 * Math.cos((2 * Math.PI * f) / D))
  return (
    <AbsoluteFill style={{ background: C.panel, fontFamily: mono, color: C.text }}>
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(120% 80% at 50% 0%, rgb(255 255 255 / 0.03), transparent 70%), radial-gradient(rgb(232 228 220 / 0.07) 1.5px, transparent 1.5px)',
          backgroundSize: '100% 100%, 32px 32px',
          backgroundPosition: '0 0, -16px -16px',
        }}
      />
      <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  )
}

export type Pos = { x: number; y: number }
const abs = (x: number, y: number, s?: CSSProperties): CSSProperties => ({ position: 'absolute', left: x, top: y, ...s })

type TP = Pos & { children: ReactNode; size?: number; font?: string; color?: string; a?: 'l' | 'c' | 'r'; w?: number; style?: CSSProperties }
/** text at x,y; anchor l|c|r horizontally, vertically centred on y */
export function T({ x, y, children, size = 24, font = mono, color = C.text, a = 'l', w = 400, style }: TP) {
  const tx = a === 'l' ? '0' : a === 'c' ? '-50%' : '-100%'
  return (
    <div style={abs(x, y, { transform: `translate(${tx}, -50%)`, fontFamily: font, fontSize: size, fontWeight: w, color, lineHeight: 1.1, whiteSpace: 'pre', fontVariantNumeric: 'tabular-nums', letterSpacing: font === sans ? (size > 100 ? '-0.03em' : '-0.02em') : 0, ...style })}>
      {children}
    </div>
  )
}

/** mono uppercase label */
export const L = (p: TP) => <T size={20} color={C.muted} {...p} style={{ textTransform: 'uppercase', letterSpacing: '0.08em', ...p.style }} />

export function Box({ x, y, w, h, color = C.line, bg = C.panel, children, style }: Pos & { w: number; h: number; color?: string; bg?: string; children?: ReactNode; style?: CSSProperties }) {
  return <div style={abs(x, y, { width: w, height: h, border: `1.5px solid ${color}`, background: bg, boxSizing: 'border-box', ...style })}>{children}</div>
}

/** hairlines; p = draw progress */
export function H({ x1, x2, y, color = C.line, p = 1 }: { x1: number; x2: number; y: number; color?: string; p?: number }) {
  return <div style={abs(x1, y - 0.75, { width: (x2 - x1) * p, height: 1.5, background: color })} />
}
export function V({ x, y1, y2, color = C.line, p = 1 }: { x: number; y1: number; y2: number; color?: string; p?: number }) {
  return <div style={abs(x - 0.75, y1, { height: (y2 - y1) * p, width: 1.5, background: color })} />
}

export function Cross({ x, y, s = 14, color = C.muted }: Pos & { s?: number; color?: string }) {
  return (
    <>
      <div style={abs(x - s / 2, y - 0.75, { width: s, height: 1.5, background: color })} />
      <div style={abs(x - 0.75, y - s / 2, { width: 1.5, height: s, background: color })} />
    </>
  )
}

/** L-corner brackets around a rect */
export function Brk({ x, y, w, h, s = 16, color = C.text, o = 8 }: Pos & { w: number; h: number; s?: number; color?: string; o?: number }) {
  const b = `1.5px solid ${color}`
  const c = (l: number, t: number, st: CSSProperties) => <div style={abs(l, t, { width: s, height: s, ...st })} />
  return (
    <>
      {c(x - o, y - o, { borderLeft: b, borderTop: b })}
      {c(x + w + o - s, y - o, { borderRight: b, borderTop: b })}
      {c(x - o, y + h + o - s, { borderLeft: b, borderBottom: b })}
      {c(x + w + o - s, y + h + o - s, { borderRight: b, borderBottom: b })}
    </>
  )
}

/** square packet a→b during frames t0..t1, with fading trail */
export function Packet({ f, t0, t1, a, b, color = C.text, s = 14 }: { f: number; t0: number; t1: number; a: Pos; b: Pos; color?: string; s?: number }) {
  const t = (f - t0) / (t1 - t0)
  return (
    <>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const q = t - i * 0.035
        if (q <= 0 || q >= 1) return null
        const e = ez(q)
        return <div key={i} style={abs(a.x + (b.x - a.x) * e - s / 2, a.y + (b.y - a.y) * e - s / 2, { width: s, height: s, background: color, opacity: i ? 0.35 * (1 - i / 7) : 1, boxShadow: i ? undefined : `0 0 24px ${color}66` })} />
      })}
    </>
  )
}

/** per-char vertical roll a→b (only differing chars move) */
export function Roll({ a, b, p }: { a: string; b: string; p: number }) {
  const n = Math.max(a.length, b.length)
  const A = a.padStart(n), B = b.padStart(n)
  const blur = `blur(${p * (1 - p) * 8}px)`
  return (
    <span style={{ display: 'inline-flex', overflow: 'hidden', lineHeight: 1.15 }}>
      {[...A].map((ca, i) => {
        const cb = B[i]!
        if (ca === cb) return <span key={i}>{ca}</span>
        return (
          <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
            <span style={{ display: 'block', transform: `translateY(${-p * 100}%)`, opacity: 1 - p, filter: blur }}>{ca}</span>
            <span style={{ position: 'absolute', left: 0, top: '100%', transform: `translateY(${-p * 100}%)`, opacity: p, filter: blur }}>{cb}</span>
          </span>
        )
      })}
    </span>
  )
}

export type Ev = { t: number; row: (k: number) => ReactNode }
/** drop-in feed: newest on top, older rows push down and fade; k = 1 for newest */
export function Feed({ f, x, y, w, rowH, events, max = 4 }: Pos & { f: number; w: number; rowH: number; events: Ev[]; max?: number }) {
  const vis = events.filter((e) => e.t <= f)
  return (
    <>
      {vis.map((e, i) => {
        const off = vis.slice(i + 1).reduce((s, n) => s + (n.t < 0 ? 1 : sp(f, n.t)), 0)
        if (off >= max) return null
        const enter = e.t < 0 ? 1 : sp(f, e.t)
        const op = enter * interpolate(off, [0, max - 1, max], [1, 0.3, 0], { extrapolateRight: 'clamp' })
        return (
          <div key={i} style={abs(x, y + off * rowH - (1 - enter) * 24, { width: w, height: rowH, opacity: op, display: 'flex', alignItems: 'center', borderBottom: `1.5px solid ${C.line}`, boxSizing: 'border-box', fontSize: 24 })}>
            {e.row(1 - Math.min(1, off))}
          </div>
        )
      })}
    </>
  )
}

/** blue square dot + mono label */
export function Live({ x, y, children, a = 'r', op = 1 }: Pos & { children: ReactNode; a?: 'l' | 'r'; op?: number }) {
  return (
    <L x={x} y={y} a={a} color={C.live} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: op }}>
      <span style={{ width: 10, height: 10, background: C.live, display: 'inline-block' }} />
      {children}
    </L>
  )
}

/** section header strip: label left, live tag right, rule under, crosshairs at ends */
export function Head({ label, right }: { label: string; right: ReactNode }) {
  return (
    <>
      <L x={64} y={56}>{`[ ${label} ]`}</L>
      {right}
      <H x1={0} x2={1600} y={112} />
    </>
  )
}

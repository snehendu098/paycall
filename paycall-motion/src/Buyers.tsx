import { Easing } from 'remotion'
import { Box, C, Feed, H, Head, L, Live, Loop, Packet, Stage, T, V, mix, sans, sp, tw, usd, type Ev } from './ui'

export const BUYERS_D = 135
const D = BUYERS_D
const ticks = [10, 30, 50]
const RELOAD = 62
const gx = 64, gw = 936, max = 12 // gauge: $0..$12
const px = (v: number) => gx + (v / max) * gw

const row = (who: string, path: string, amt: string, live?: boolean) => (k: number) => (
  <>
    <span style={{ width: 300, color: C.muted }}>{who}</span>
    <span style={{ flex: 1 }}>{path}</span>
    <span style={{ color: live ? C.live : mix(k, C.muted, C.text) }}>{amt}</span>
  </>
)
const events: Ev[] = [
  // initial rows = end state, so the loop seam is clean
  { t: -4, row: row('claude-desktop', 'GET /geocode', '−$0.05') },
  { t: -3, row: row('claude-desktop', 'GET /weather', '−$0.05') },
  { t: -2, row: row('claude-desktop', 'GET /forecast', '−$0.05') },
  { t: -1, row: row('PayPal wallet', 'auto-reload', '+$10.00', true) },
  { t: ticks[0]!, row: row('claude-desktop', 'GET /geocode', '−$0.05') },
  { t: ticks[1]!, row: row('claude-desktop', 'GET /weather', '−$0.05') },
  { t: ticks[2]!, row: row('claude-desktop', 'GET /forecast', '−$0.05') },
  { t: RELOAD + 8, row: row('PayPal wallet', 'auto-reload', '+$10.00', true) },
]

function Scene({ f }: { f: number }) {
  const spent = ticks.reduce((s, t) => s + 0.05 * sp(f, t), 0)
  const back = tw(f, 108, D, 0, 1, Easing.inOut(Easing.cubic)) // fast-forward back to start for the loop
  const bal = 2.13 - spent + 10 * tw(f, RELOAD + 8, 98) - 9.85 * back
  const cap = 0.15 + spent - 0.15 * back
  const glow = tw(f, RELOAD - 2, RELOAD + 2) * (1 - tw(f, 100, 116))
  const cross = tw(f, 52, 56) * (1 - tw(f, 96, 106))
  const hit = (t: number) => tw(f, t, t + 3) * (1 - tw(f, t + 6, t + 16))
  const call = Math.max(...ticks.map(hit))
  const scraper = tw(f, 84, 90) * (1 - tw(f, 118, 124))

  return (
    <Stage f={f} D={D}>
      <Head label="Prepaid balance" right={<Live x={1536} y={56}>Auto-reload on</Live>} />

      {/* balance + gauge */}
      <L x={64} y={176}>Balance · USD</L>
      <T x={56} y={280} size={176} font={sans} w={300} color={mix(glow, C.text, C.live)}>{usd(bal)}</T>
      <L x={px(2) + 16} y={400} color={mix(cross, C.muted, C.live)}>Reload below $2.00</L>
      <Box x={gx} y={432} w={gw} h={48} bg="transparent" />
      <div style={{ position: 'absolute', left: gx, top: 432, height: 48, width: Math.max(0, px(bal) - gx), background: C.text, opacity: 0.9 }} />
      <V x={px(2)} y1={384} y2={496} color={C.live} />
      {Array.from({ length: max + 1 }, (_, i) => (
        <V key={i} x={px(i)} y1={496} y2={i % 4 ? 504 : 512} color={C.dim} />
      ))}
      {[0, 4, 8, 12].map((v) => <L key={v} x={px(v)} y={540} a={v ? (v === 12 ? 'r' : 'c') : 'l'} color={C.dim}>{`$${v}`}</L>)}

      {/* call feed */}
      <L x={64} y={624}>[ Calls ]</L>
      <L x={1000} y={624} a="r" color={C.dim}>Debited per call</L>
      <H x1={64} x2={1000} y={656} />
      <Feed f={f} x={64} y={656} w={936} rowH={72} events={events} max={3} />

      <V x={1064} y1={112} y2={1000} />

      {/* PayPal wallet */}
      <Box x={1112} y={160} w={424} h={208} color={mix(glow, C.line, C.live)} style={{ transform: `scale(${1 + 0.03 * glow})` }}>
        <T x={32} y={56} size={44} font={sans} w={300}>PayPal</T>
        <L x={32} y={104}>Saved wallet · ••42</L>
        <L x={32} y={160}>Auto-reload</L>
        <T x={392} y={156} a="r" size={40} font={sans} w={300} color={mix(glow, C.muted, C.live)}>+$10.00</T>
      </Box>
      <Packet f={f} t0={RELOAD} t1={RELOAD + 10} a={{ x: 1112, y: 264 }} b={{ x: px(2), y: 456 }} color={C.live} />

      {/* daily cap */}
      <L x={1112} y={432}>Daily cap</L>
      <T x={1536} y={432} a="r" size={24}>{`${usd(cap)} / $5.00`}</T>
      <div style={{ position: 'absolute', left: 1112, top: 472, width: 424, height: 8, background: C.line }} />
      <div style={{ position: 'absolute', left: 1112, top: 472, width: (424 * cap) / 5, height: 8, background: C.text }} />

      {/* agents */}
      {[
        ['claude-desktop', 1, call],
        ['scraper-bot', scraper, 0],
        ['research-agent', 1, 0],
      ].map(([name, on, ping], i) => {
        const y = 536 + i * 120
        return (
          <Box key={name as string} x={1112} y={y} w={424} h={104} color={mix(ping as number, C.line, C.text)}>
            <T x={32} y={52} size={28} font={sans} w={300} color={mix(on as number, C.muted, C.text)}>{name}</T>
            <Live x={392} y={52} op={on as number}>Active</Live>
            <L x={392} y={52} a="r" style={{ opacity: 1 - (on as number) }}>Paused</L>
          </Box>
        )
      })}
    </Stage>
  )
}

export const Buyers = () => <Loop D={D} Scene={Scene} />

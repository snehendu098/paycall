import { Easing } from 'remotion'
import { Box, C, H, Head, L, Live, Loop, Packet, Stage, T, V, ez, mix, sans, sp, tw, usd } from './ui'

export const SELLERS_D = 135
const D = SELLERS_D
const calls = [6, 26, 46]
const LANE = 472, GATE = 800
const PAY = 72 // payout fires once earnings hit $0.50

function Call({ f, t0 }: { f: number; t0: number }) {
  const f402 = tw(f, t0 + 12, t0 + 14) * (1 - tw(f, t0 + 17, t0 + 19))
  const paid = tw(f, t0 + 17, t0 + 20) * (1 - tw(f, t0 + 30, t0 + 36))
  const rise = tw(f, t0 + 17, t0 + 36, 0, -24)
  return (
    <>
      <Packet f={f} t0={t0} t1={t0 + 14} a={{ x: 64, y: LANE }} b={{ x: GATE, y: LANE }} />
      <Packet f={f} t0={t0 + 18} t1={t0 + 32} a={{ x: GATE, y: LANE }} b={{ x: 1536, y: LANE }} color={C.live} />
      <L x={GATE} y={400} a="c" color={C.text} style={{ opacity: f402 }}>402 · $0.01</L>
      <L x={GATE} y={400 + rise} a="c" color={C.live} style={{ opacity: paid }}>Paid $0.01</L>
    </>
  )
}

function Scene({ f }: { f: number }) {
  const credit = calls.reduce((s, t) => s + 0.01 * sp(f, t + 18), 0)
  const back = tw(f, 108, D, 0, 1, Easing.inOut(Easing.cubic)) // climb back to start for the loop
  const earn = 0.47 + credit - 0.5 * tw(f, PAY, PAY + 8) + 0.47 * back
  const full = tw(f, 62, 66) * (1 - tw(f, PAY, PAY + 8))
  const gate = Math.max(...calls.map((t) => tw(f, t + 12, t + 15) * (1 - tw(f, t + 18, t + 26))))
  // payout card: appear, arc to PayPal box, absorb
  const q = tw(f, PAY + 4, PAY + 28, 0, 1, Easing.inOut(Easing.cubic))
  const cardOp = tw(f, PAY - 2, PAY + 4) * (1 - tw(f, PAY + 24, PAY + 30))
  const cx = 720 + (1324 - 720) * q, cy = 800 - Math.sin(Math.PI * q) * 90
  const recv = tw(f, PAY + 26, PAY + 30) * (1 - tw(f, 112, 132))
  const glow = tw(f, PAY + 26, PAY + 30) * (1 - tw(f, PAY + 40, PAY + 56))

  return (
    <Stage f={f} D={D}>
      <Head label="Paid proxy" right={<Live x={1536} y={56}>$0.01 / call</Live>} />

      {/* api → proxy url */}
      <Box x={64} y={160} w={496} h={144}>
        <L x={32} y={44}>Your API</L>
        <T x={32} y={96} size={28}>api.weather.dev/v1</T>
      </Box>
      <H x1={560} x2={720} y={232} color={C.muted} />
      <T x={704} y={230} a="c" size={24} color={C.muted}>›</T>
      <Box x={720} y={160} w={816} h={144} color={C.muted}>
        <L x={32} y={44}>PayCall proxy URL</L>
        <T x={32} y={96} size={32}>paycall.dev/p/ep_7f3a</T>
        <L x={784} y={96} a="r" color={C.dim}>Forwards untouched</L>
      </Box>

      {/* call lane */}
      <H x1={64} x2={1536} y={LANE} />
      {Array.from({ length: 24 }, (_, i) => <V key={i} x={64 + i * 64} y1={LANE + 8} y2={LANE + 16} color={C.dim} />)}
      <L x={64} y={528}>Agents</L>
      <L x={1536} y={528} a="r">Your API</L>
      {calls.map((t) => <Call key={t} f={f} t0={t} />)}
      {[110, 116, 122, 128].map((t) => (
        <div key={t} style={{ opacity: 0.4 }}><Packet f={f} t0={t} t1={t + 16} a={{ x: 64, y: LANE }} b={{ x: 1536, y: LANE }} s={10} /></div>
      ))}
      <Box x={GATE - 104} y={LANE - 36} w={208} h={72} color={mix(gate, C.muted, C.text)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + 0.04 * gate})` }}>
        <span style={{ fontSize: 20, letterSpacing: '0.08em', color: C.text }}>PAYCALL</span>
      </Box>
      <L x={GATE} y={548} a="c">402 › pay › forward</L>

      <H x1={0} x2={1600} y={624} />
      <V x={1064} y1={624} y2={1000} />

      {/* earnings */}
      <L x={64} y={680}>Earnings · USD</L>
      <T x={56} y={790} size={176} font={sans} w={300}>{usd(Math.max(0, earn))}</T>
      <L x={64} y={904}>Payout at $0.50</L>
      <L x={1000} y={904} a="r" color={mix(full, C.dim, C.live)}>2% fee</L>
      <div style={{ position: 'absolute', left: 64, top: 936, width: 936, height: 8, background: C.line }} />
      <div style={{ position: 'absolute', left: 64, top: 936, width: Math.min(1, Math.max(0, earn) / 0.5) * 936, height: 8, background: mix(full, C.text, C.live) }} />

      {/* PayPal */}
      <Box x={1112} y={664} w={424} h={288} color={mix(glow, C.line, C.live)} style={{ transform: `scale(${1 + 0.03 * glow})` }}>
        <T x={32} y={56} size={44} font={sans} w={300}>PayPal</T>
        <L x={32} y={104}>Seller wallet</L>
        <L x={32} y={192}>Last payout</L>
        <T x={32} y={236} size={26} color={mix(recv, C.muted, C.live)}>$0.49 · sent ✓</T>
      </Box>

      {/* payout card */}
      <Box x={cx - 220} y={cy - 40} w={440} h={80} color={C.live} style={{ opacity: cardOp, transform: `scale(${1 - 0.2 * ez(q)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 48px ${C.live}22` }}>
        <span style={{ fontSize: 22, letterSpacing: '0.06em', color: C.live, textTransform: 'uppercase' }}>Payout $0.49 · 2% fee · sent</span>
      </Box>
    </Stage>
  )
}

export const Sellers = () => <Loop D={D} Scene={Scene} />

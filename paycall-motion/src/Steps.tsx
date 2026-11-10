import { Box, Brk, C, H, L, Loop, Packet, Stage, T, V, mix, sans, sp, tw } from './ui'

export const STEPS_D = 120
const D = STEPS_D
const W = 1600 / 3
const Y = 300
const cx = (i: number) => W * i + W / 2
const at = [8, 40, 72]

function Scene({ f }: { f: number }) {
  const off = 1 - tw(f, 100, 114)
  const lit = at.map((t) => sp(f, t) * off)
  const [l1, l2, l3] = lit as [number, number, number]
  const s = (l: number) => mix(l, C.line, C.text)
  const t = (l: number) => mix(l, C.dim, C.text)
  const sc = (l: number) => `scale(${0.96 + 0.04 * l})`
  const link = (i: number, a: number) => {
    const x1 = cx(i) + 136, x2 = cx(i + 1) - (i ? 136 : 168)
    return (
      <>
        <H x1={x1} x2={x2} y={Y} color={C.line} />
        <div style={{ opacity: off }}><H x1={x1} x2={x2} y={Y} color={C.muted} p={tw(f, a, a + 16)} /></div>
        <Packet f={f} t0={a} t1={a + 16} a={{ x: x1, y: Y }} b={{ x: x2, y: Y }} color={i ? C.live : C.text} s={12} />
      </>
    )
  }

  return (
    <Stage f={f} D={D}>
      <V x={W} y1={0} y2={600} />
      <V x={W * 2} y1={0} y2={600} />
      {[['01', 'Request', '402 · price quoted'], ['02', 'Sign', 'Voucher · ed25519'], ['03', 'Settle', 'Batched PayPal payout']].map(([n, k, cap], i) => (
        <div key={n}>
          <T x={W * i + 64} y={72} size={22} color={t(lit[i]!)}>{n}</T>
          <L x={W * (i + 1) - 64} y={72} a="r" color={mix(lit[i]!, C.dim, C.muted)}>{k}</L>
          <L x={cx(i)} y={520} a="c" color={mix(lit[i]!, C.dim, C.muted)}>{cap}</L>
        </div>
      ))}
      {link(0, 24)}
      {link(1, 56)}

      {/* 01: 402 */}
      <div style={{ position: 'absolute', inset: 0, transform: sc(l1), transformOrigin: `${cx(0)}px ${Y}px` }}>
        <Box x={cx(0) - 112} y={Y - 72} w={224} h={144} color={s(l1)}>
          <T x={112} y={64} a="c" size={72} font={sans} w={300} color={t(l1)}>402</T>
          <L x={112} y={116} a="c" color={mix(l1, C.dim, C.muted)}>$0.01</L>
        </Box>
        <div style={{ opacity: l1 }}><Brk x={cx(0) - 112} y={Y - 72} w={224} h={144} /></div>
      </div>

      {/* 02: stacked vouchers */}
      <div style={{ position: 'absolute', inset: 0, transform: sc(l2), transformOrigin: `${cx(1)}px ${Y}px` }}>
        {[2, 1].map((k) => <Box key={k} x={cx(1) - 112 - k * 16} y={Y - 72 - k * 16} w={224} h={144} color={mix(l2 * (1 - k * 0.3), C.line, C.muted)} />)}
        <Box x={cx(1) - 112} y={Y - 72} w={224} h={144} color={s(l2)}>
          <T x={28} y={56} size={56} font={sans} w={300} color={t(l2)}>#7</T>
          <L x={196} y={112} a="r" color={mix(l2, C.dim, C.muted)}>Σ $0.07</L>
        </Box>
        <T x={cx(1) + 132} y={Y - 52} size={32} color={mix(l2, C.dim, C.live)}>✓</T>
      </div>

      {/* 03: fan-in to PayPal */}
      <div style={{ position: 'absolute', inset: 0, transform: sc(l3), transformOrigin: `${cx(2)}px ${Y}px` }}>
        <svg width={1600} height={600} style={{ position: 'absolute', inset: 0 }}>
          {[-2, -1, 0, 1, 2].map((k) => (
            <path key={k} d={`M ${cx(2) - 112} ${Y + k * 44} C ${cx(2) - 56} ${Y + k * 44}, ${cx(2) - 72} ${Y}, ${cx(2) - 8} ${Y}`} fill="none" stroke={mix(l3, C.line, C.muted)} strokeWidth={1.5} />
          ))}
        </svg>
        <Box x={cx(2) - 8} y={Y - 48} w={152} h={96} color={mix(l3, C.line, C.live)}>
          <T x={76} y={48} a="c" size={34} font={sans} w={300} color={mix(l3, C.dim, C.live)}>PayPal</T>
        </Box>
      </div>
    </Stage>
  )
}

export const Steps = () => <Loop D={D} Scene={Scene} />

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Btn, Frame, Index, Item, Label, Mark, Nav, Reveal, Rule, Spotlight, Stagger } from '@/components/ds'
import { NetworkGlobe } from '@/components/landing'
import PixelBlast from '@/components/PixelBlast'
import PixelSnow from '@/components/PixelSnow'
import Radar from '@/components/Radar'
import Topography from '@/components/Topography'

// rhythm: every section block py-20/32; label → 24 → heading → 24 → sub → 40 → CTA / list
const pad = 'px-6 md:px-12 lg:px-16'
const sy = 'py-20 md:py-32'
const h2 = 'text-balance text-[clamp(40px,4vw,64px)] font-light leading-[1] tracking-[-0.04em]'
const sub = 'mt-6 max-w-[52ch] text-pretty text-base leading-relaxed text-muted-foreground md:text-lg'

function SectionHead({ n, mark, label }: { n: number; mark: string; label: string }) {
  return (
    <div className={`flex h-14 items-center justify-between gap-4 border-b border-border ${pad}`}>
      <div className="flex items-center gap-6">
        <Index n={n} />
        <Mark>{mark}</Mark>
      </div>
      <Label className="hidden sm:inline">{label}</Label>
    </div>
  )
}

// feature strip under a split: 1 / 2 / 4 columns, hairline cells
function Points({ items }: { items: [string, string][] }) {
  return (
    <Stagger inView gap={0.06} className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <Item key={k} className="border-b border-border sm:odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
          <div className={`group h-full py-8 transition-colors hover:bg-foreground/[0.02] md:py-12 ${pad}`}>
            <span
              aria-hidden
              className="inline-block font-mono text-sm text-muted-foreground transition-transform duration-300 group-hover:rotate-90 group-hover:text-foreground"
            >
              +
            </span>
            <h3 className="mt-6 text-lg tracking-tight">{k}</h3>
            <p className="mt-2 max-w-[36ch] text-pretty text-[15px] leading-relaxed text-muted-foreground">{v}</p>
          </div>
        </Item>
      ))}
    </Stagger>
  )
}

function Split({ text, visual, points, flip }: { text: ReactNode; visual: ReactNode; points: [string, string][]; flip?: boolean }) {
  return (
    <>
      {/* text 5fr / visual 7fr, shared vertical padding, centred to each other */}
      <div className={`grid ${flip ? 'lg:grid-cols-[7fr_5fr]' : 'lg:grid-cols-[5fr_7fr]'}`}>
        <div className={`flex flex-col justify-center ${pad} pb-12 pt-20 md:pb-16 md:pt-32 lg:py-32 ${flip ? 'lg:order-2' : ''}`}>{text}</div>
        {/* visual fills cell edge to edge, no inner frame */}
        <div
          className={`relative aspect-[16/10] overflow-hidden border-t border-border lg:aspect-auto lg:border-t-0 ${flip ? 'lg:order-1 lg:border-r' : 'lg:border-l'}`}
        >
          {visual}
        </div>
      </div>
      <Points items={points} />
    </>
  )
}

const steps: { n: 1 | 2 | 3; k: string; t: string; d: string }[] = [
  {
    n: 1,
    k: 'request',
    t: 'The API answers 402',
    d: 'Your agent calls a paid URL. PayCall replies HTTP 402 Payment Required with the price, per the x402 standard.',
  },
  {
    n: 2,
    k: 'sign',
    t: 'Agent signs a voucher',
    d: 'It signs a tiny cumulative Ed25519 voucher and retries. No card prompt, no per-call PayPal fee.',
  },
  {
    n: 3,
    k: 'settle',
    t: 'Settled, then paid out',
    d: 'Your prepaid balance is debited instantly. Seller earnings batch into automatic PayPal payouts.',
  },
]

export default function Home() {
  return (
    <Frame nav={<Nav />}>
      {/* hero */}
      <section className="grid lg:grid-cols-2">
        <Stagger delay={0.1} className={`flex flex-col justify-center gap-12 md:gap-16 ${pad} ${sy}`}>
          <Item>
            <Label>Built for agents that pay their own way</Label>
          </Item>
          <div>
            <Item>
              <h1 className="text-[clamp(46px,5.3vw,100px)] font-light leading-[0.94] tracking-[-0.05em]">
                Pay‑per‑call <br />
                for AI agents, <br />
                settled on PayPal
              </h1>
            </Item>
            <Item>
              <p className={`${sub} mt-8`}>Your agent hits HTTP 402, signs a voucher, gets the data. You top up once.</p>
            </Item>
            <Item className="mt-10 flex flex-wrap gap-3">
              <Btn href="/signup">Get started</Btn>
              <Btn href="/signup?sell=1" variant="outline">
                I sell an API
              </Btn>
            </Item>
          </div>
          <Item className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>HTTP 402</span>
            <span>Ed25519 vouchers</span>
            <span>PayPal settlement</span>
            <span>MCP + SDK</span>
          </Item>
        </Stagger>
        <Spotlight className="border-t border-border bg-card lg:border-l lg:border-t-0">
          <NetworkGlobe />
        </Spotlight>
      </section>

      <Rule />

      {/* {01} buyers */}
      <section id="buyers">
        <SectionHead n={1} mark="For buyers" label="Prepaid wallet" />
        <Split
          text={
            <Reveal>
              <Label>Top up with PayPal</Label>
              <h2 className={`${h2} mt-6`}>Top up once. Your agents spend by the call.</h2>
              <p className={sub}>
                Fund a balance with PayPal and save the wallet. Register Claude through the PayCall MCP server, or any agent through the SDK.
              </p>
            </Reveal>
          }
          visual={
            <Radar color="#9e9e9e" mode="sweep" speed={1} trail={0.35} scale={0.9} ringCount={6} spokeCount={12} targets={6} clutter={0.35} mouseInteraction />
          }
          points={[
            ['Auto-reload', 'Your saved PayPal wallet refills the balance when it runs low.'],
            ['Daily caps', 'A hard ceiling on what each agent can spend per day.'],
            ['Max price per call', 'Agents refuse anything priced above your limit.'],
            ['Pause any agent', 'One switch. Its next call is declined.'],
          ]}
        />
      </section>

      <Rule />

      {/* {02} sellers */}
      <section id="sellers">
        <SectionHead n={2} mark="For sellers" label="Paid proxy URL" />
        <Split
          flip
          text={
            <Reveal>
              <Label>Monetize any endpoint</Label>
              <h2 className={`${h2} mt-6`}>Any HTTPS API. A price per call. Paid to PayPal.</h2>
              <p className={sub}>
                Paste your endpoint, set a price, get a paid proxy URL. It answers 402 until the agent pays, then forwards the request untouched.
              </p>
            </Reveal>
          }
          visual={
            <PixelBlast
              variant="square"
              pixelSize={3}
              color="#878787"
              patternScale={2}
              patternDensity={1}
              softness={0.6}
              glow={0.4}
              twinkle={0.25}
              drift={0.2}
              hoverEffect="reveal"
              enableRipples
              edgeFade={0.25}
              accentColor="#383838"
            />
          }
          points={[
            ['No code changes', 'Your API stays as is. PayCall sits in front.'],
            ['Price per call', 'Set it in cents or fractions of one. Change it any time.'],
            ['Automatic payouts', 'To your PayPal every 10 min once you reach $0.50. 2% fee.'],
            ['Live ledger', 'Every paid call streams into your dashboard.'],
          ]}
        />
      </section>

      <Rule />

      {/* {03} how it works */}
      <section id="how">
        <SectionHead n={3} mark="How it works" label="x402 · HTTP 402" />
        <div className={`${pad} ${sy}`}>
          <Reveal className="grid items-end gap-6 lg:grid-cols-2">
            <div>
              <Label>From request to payout</Label>
              <h2 className={`${h2} mt-6 max-w-[18ch]`}>Three hops between a request and a payout.</h2>
            </div>
            <p className={`${sub} lg:justify-self-end`}>
              Built on x402, the open HTTP 402 standard. Vouchers are cumulative, so one signature covers every call so far and nothing settles per request.
            </p>
          </Reveal>
        </div>
        <div className="relative h-[280px] border-t border-border md:h-[420px]">
          <Topography
            color="#5f5f5f"
            lineCount={18}
            lineWidth={1.2}
            elevation={1.6}
            foreground={0.2}
            tilt={24}
            speed={0.25}
            direction="forward"
            glow={0.6}
            depthOfField={0.4}
            fog={0.5}
            hoverEffect="lift"
            clickEffect="peak"
            scale={0.9}
          />
        </div>
        <Stagger inView gap={0.12} className="grid border-t border-border md:grid-cols-3">
          {steps.map((s) => (
            <Item key={s.n} className="border-b border-border last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <Spotlight className={`h-full ${pad} py-12 md:px-10 md:py-16`}>
                <span className="font-mono text-xs text-muted-foreground">
                  0{s.n} · <span className="uppercase tracking-wider">{s.k}</span>
                </span>
                <h3 className="mt-6 text-balance text-[28px] font-light leading-tight tracking-[-0.02em]">{s.t}</h3>
                <p className="mt-4 max-w-[40ch] text-pretty text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
              </Spotlight>
            </Item>
          ))}
        </Stagger>
      </section>

      <Rule />

      {/* closing CTA: snow fills section edge to edge */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <PixelSnow color="#ffffff" variant="snowflake" density={0.5} speed={1} wind={0.25} flakeSize={1} pixelSize={3} glow={0.8} mouseInteraction />
        </div>
        <Reveal className={`relative text-center ${pad} py-28 md:py-44`}>
          <Label>Demo · a weather API at $0.01 per call</Label>
          <h2 className="mx-auto mt-8 max-w-[14ch] text-balance text-[clamp(48px,7vw,120px)] font-light leading-[0.92] tracking-[-0.05em]">
            Your agent&apos;s wallet starts here
          </h2>
          <p className="mx-auto mt-8 max-w-[46ch] text-pretty text-muted-foreground md:text-lg">
            Watch Claude find a paid API, answer the 402 and pay for it on its own.
          </p>
          <div className="mt-12 flex justify-center">
            <Btn href="/signup">Get started</Btn>
          </div>
        </Reveal>
      </section>

      <Rule />

      <footer
        className={`flex flex-col gap-6 py-10 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:flex-row sm:items-center sm:justify-between ${pad}`}
      >
        <span>Built on PayPal (sandbox) · x402</span>
        <nav className="flex gap-8">
          <Link href="/docs" className="transition-colors hover:text-foreground">
            Docs
          </Link>
          <a href="https://github.com/snehendu098/paycall" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            GitHub
          </a>
          <a href="#sellers" className="transition-colors hover:text-foreground">
            Sellers
          </a>
        </nav>
      </footer>
    </Frame>
  )
}

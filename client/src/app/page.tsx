import type { ReactNode } from 'react'
import { Brackets, Btn, Frame, Index, Item, Label, Mark, Nav, Reveal, Rule, Spotlight, Stagger } from '@/components/ds'
import { BalanceMeter, HeroFlow, ProxySchematic, StepGlyph } from '@/components/landing'

// rhythm: label → 24 → heading → 24 → sub → 40 → CTA / list
const pad = 'px-6 md:px-12 lg:px-16'
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

function Points({ items }: { items: [string, string][] }) {
  return (
    <Stagger inView gap={0.06} className="mt-12 border-t border-border">
      {items.map(([k, v]) => (
        <Item key={k}>
          <div className="group grid grid-cols-[24px_1fr] gap-x-4 gap-y-1 border-b border-border py-4 transition-colors hover:bg-foreground/[0.02] xl:grid-cols-[24px_168px_1fr]">
            <span aria-hidden className="font-mono text-sm text-muted-foreground transition-transform duration-300 group-hover:rotate-90 group-hover:text-foreground">+</span>
            <span className="text-[15px]">{k}</span>
            <span className="col-start-2 text-[15px] text-muted-foreground xl:col-start-3">{v}</span>
          </div>
        </Item>
      ))}
    </Stagger>
  )
}

function Split({ text, visual, flip }: { text: ReactNode; visual: ReactNode; flip?: boolean }) {
  return (
    // text 5fr / visual 7fr, both cols share one vertical padding, centred to each other
    <div className={`grid lg:items-stretch ${flip ? 'lg:grid-cols-[7fr_5fr]' : 'lg:grid-cols-[5fr_7fr]'}`}>
      <div className={`flex flex-col justify-center ${pad} py-20 md:py-24 lg:py-32 ${flip ? 'lg:order-2' : ''}`}>{text}</div>
      <div className={`flex items-center border-border ${pad} pb-20 md:pb-24 lg:py-32 ${flip ? 'lg:order-1 lg:border-r' : 'lg:border-l'}`}>
        <Reveal delay={0.1} className="w-full">{visual}</Reveal>
      </div>
    </div>
  )
}

const steps: { n: 1 | 2 | 3; k: string; t: string; d: string }[] = [
  { n: 1, k: 'request', t: 'The API answers 402', d: 'Your agent calls a paid URL. PayCall replies HTTP 402 Payment Required with the price, per the x402 standard.' },
  { n: 2, k: 'sign', t: 'Agent signs a voucher', d: 'It signs a tiny cumulative Ed25519 voucher and retries. No card prompt, no per-call PayPal fee.' },
  { n: 3, k: 'settle', t: 'Settled, then paid out', d: 'Your prepaid balance is debited instantly. Seller earnings batch into automatic PayPal payouts.' },
]

export default function Home() {
  return (
    <Frame nav={<Nav />}>
      {/* hero */}
      <section className="grid lg:min-h-[calc(100svh-57px)] lg:grid-cols-2">
        <Stagger delay={0.1} className={`flex flex-col justify-between gap-12 md:gap-16 ${pad} py-14 md:py-20`}>
          <Item><Label>Built for agents that pay their own way</Label></Item>
          <div>
            <Item>
              <h1 className="text-[clamp(46px,5.3vw,100px)] font-light leading-[0.94] tracking-[-0.05em]">
                Pay‑per‑call <br />for AI agents, <br />settled on PayPal
              </h1>
            </Item>
            <Item>
              <p className={`${sub} mt-8`}>Your agent hits HTTP 402, signs a voucher, gets the data. You top up once.</p>
            </Item>
            <Item className="mt-10 flex flex-wrap gap-3">
              <Btn href="/signup">Get started</Btn>
              <Btn href="/signup?sell=1" variant="outline">I sell an API</Btn>
            </Item>
          </div>
          <Item className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>HTTP 402</span><span>Ed25519 vouchers</span><span>PayPal settlement</span><span>MCP + SDK</span>
          </Item>
        </Stagger>
        <Spotlight className="border-t border-border bg-card lg:border-l lg:border-t-0">
          <HeroFlow />
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
              <Points
                items={[
                  ['Auto-reload', 'Your saved PayPal wallet refills the balance when it runs low.'],
                  ['Daily caps', 'A hard ceiling on what each agent can spend per day.'],
                  ['Max price per call', 'Agents refuse anything priced above your limit.'],
                  ['Pause any agent', 'One switch. Its next call is declined.'],
                ]}
              />
            </Reveal>
          }
          visual={<BalanceMeter />}
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
              <Points
                items={[
                  ['No code changes', 'Your API stays as is. PayCall sits in front.'],
                  ['Price per call', 'Set it in cents or fractions of one. Change it any time.'],
                  ['Automatic payouts', 'To your PayPal every 10 min once you reach $0.50. 2% fee.'],
                  ['Live ledger', 'Every paid call streams into your dashboard.'],
                ]}
              />
            </Reveal>
          }
          visual={<ProxySchematic />}
        />
      </section>

      <Rule />

      {/* {03} how it works */}
      <section id="how">
        <SectionHead n={3} mark="How it works" label="x402 · HTTP 402" />
        <div className={`${pad} pb-16 pt-20 md:pb-24 md:pt-32 lg:pt-36`}>
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
        <Stagger inView gap={0.12} className="grid border-t border-border md:grid-cols-3">
          {steps.map((s) => (
            <Item key={s.n} className="border-b border-border last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <Spotlight className={`h-full ${pad} py-16 md:px-10 md:py-20`}>
                <div className="mb-12 flex items-center justify-between font-mono text-xs text-muted-foreground">
                  <span>0{s.n}</span>
                  <span className="uppercase tracking-wider">{s.k}</span>
                </div>
                <StepGlyph n={s.n} />
                <h3 className="mt-12 text-balance text-[28px] font-light leading-tight tracking-[-0.02em]">{s.t}</h3>
                <p className="mt-4 max-w-[40ch] text-pretty text-[15px] leading-relaxed text-muted-foreground">{s.d}</p>
              </Spotlight>
            </Item>
          ))}
        </Stagger>
      </section>

      <Rule />

      {/* closing CTA */}
      <section className={`${pad} py-20 md:py-36 lg:py-40`}>
        <Reveal>
          <Brackets size={16} className="pc-dots mx-auto max-w-6xl px-6 py-20 text-center md:px-16 md:py-28">
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
          </Brackets>
        </Reveal>
      </section>

      <Rule />

      <footer className={`flex flex-col gap-6 py-10 font-mono text-[11px] uppercase tracking-wider text-muted-foreground sm:flex-row sm:items-center sm:justify-between ${pad}`}>
        <span>Built on PayPal (sandbox) · x402</span>
        <nav className="flex gap-8">
          <a href="#" className="transition-colors hover:text-foreground">Docs</a>
          <a href="https://github.com/snehendu098/paycall" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">GitHub</a>
          <a href="#sellers" className="transition-colors hover:text-foreground">Sellers</a>
        </nav>
      </footer>
    </Frame>
  )
}

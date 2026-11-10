'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Brackets, Btn, Field, Frame, Input, Item, Label, Nav, Spotlight, Stagger } from '@/components/ds'
import { MiniFlow, mono, pad } from '@/components/portal'

// ?next (same-origin only) > signup ?sell=1 → /app/earn > /app
function dest(signup: boolean) {
  const q = new URLSearchParams(location.search)
  const next = q.get('next')
  if (next?.startsWith('/') && !next.startsWith('//')) return next
  return signup && q.get('sell') ? '/app/earn' : '/app'
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Errs = { name?: string; email?: string; otp?: string; form?: string }

/** Split auth page: copy + schematic left, bracketed form right. Email → code → in. */
export function AuthForm({ signup }: { signup?: boolean }) {
  const router = useRouter()
  const [errs, setErrs] = useState<Errs>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ email: string; name: string } | null>(null)

  async function send(email: string, name: string) {
    setBusy(true)
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
    setBusy(false)
    if (error) return setErrs({ form: error.message ?? 'Could not send code' })
    setErrs({})
    setSent({ email, name })
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (!sent) {
      const name = String(f.get('name') ?? '').trim(), email = String(f.get('email')).trim().toLowerCase()
      const v: Errs = { name: signup && !name ? 'Your name' : undefined, email: !EMAIL.test(email) ? 'Enter a valid email' : undefined }
      setErrs(v)
      if (v.name || v.email) return
      return send(email, name)
    }
    const otp = String(f.get('otp')).replace(/\D/g, '')
    if (otp.length !== 6) return setErrs({ otp: 'Enter the 6-digit code' })
    setBusy(true)
    const { error } = await authClient.signIn.emailOtp({ email: sent.email, otp, ...(sent.name && { name: sent.name }) })
    if (error) {
      setBusy(false)
      return setErrs({ otp: error.message ?? 'Wrong code' })
    }
    router.push(dest(!!signup))
  }

  const swap = signup
    ? <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">Log in</Link>
    : <Link href="/signup" className="text-muted-foreground transition-colors hover:text-foreground">Sign up</Link>

  return (
    <Frame nav={<Nav left={<span className={mono}>x402 · PayPal</span>} right={swap} />}>
      <section className="grid lg:min-h-[calc(100svh-57px)] lg:grid-cols-2">
        <Stagger delay={0.1} className={`hidden flex-col justify-between gap-12 py-14 md:py-20 lg:flex ${pad} lg:px-16`}>
          <Item><Label>{signup ? 'One account · spend and earn' : 'Welcome back'}</Label></Item>
          <div>
            <Item>
              <h1 className="text-[clamp(44px,4.6vw,84px)] font-light leading-[0.94] tracking-[-0.05em]">
                {signup ? <>Give your agents <br />a wallet.</> : <>Your agents <br />kept paying <br />while you were away.</>}
              </h1>
            </Item>
            <Item>
              <p className="mt-8 max-w-[44ch] text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
                {signup
                  ? 'Top up once with PayPal and let agents pay per call. Or put a price on your API and get paid out automatically.'
                  : 'Balances, agents, endpoints and payouts. All live.'}
              </p>
            </Item>
            <Item className="mt-14 border-t border-border pt-8">
              <MiniFlow />
            </Item>
          </div>
          <Item className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>HTTP 402</span><span>Ed25519 vouchers</span><span>PayPal settlement</span>
          </Item>
        </Stagger>

        <Spotlight className="flex items-center justify-center border-border bg-card px-4 py-14 sm:px-6 md:py-20 lg:border-l">
          <Stagger delay={0.2} className="w-full max-w-[420px]">
            <Item className="mb-8 lg:hidden">
              <Label>{signup ? 'One account · spend and earn' : 'Welcome back'}</Label>
            </Item>
            <Item>
              <Brackets size={12} className="border border-border bg-background/60 backdrop-blur-sm">
                <div className="flex h-12 items-center justify-between border-b border-border px-6">
                  <Label>{signup ? 'Create account' : 'Log in'}</Label>
                  <span className={mono}>{signup ? '01 / 01' : 'session'}</span>
                </div>
                <div className="p-6 sm:p-8">
                  <h2 className="text-[32px] font-light leading-tight tracking-[-0.03em]">{signup ? 'Create your account' : 'Log in to PayCall'}</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {sent ? <>Code sent to <span className="text-foreground">{sent.email}</span>.</> : 'We email you a 6-digit code. No password.'}
                  </p>
                  <form key={sent ? 'otp' : 'email'} onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
                    {!sent && signup && (
                      <Field label="Name" id="name" error={errs.name}>
                        <Input id="name" name="name" autoComplete="name" placeholder="Ada Lovelace" aria-invalid={!!errs.name} />
                      </Field>
                    )}
                    {!sent ? (
                      <Field label="Email" id="email" error={errs.email}>
                        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={!!errs.email} autoFocus />
                      </Field>
                    ) : (
                      <Field label="Code" id="otp" error={errs.otp} hint="Expires in 5 minutes.">
                        <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" aria-invalid={!!errs.otp} autoFocus className="font-mono tracking-[0.5em]" />
                      </Field>
                    )}
                    {errs.form && <p role="alert" className="border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive">{errs.form}</p>}
                    <Btn type="submit" disabled={busy} className="mt-1 w-full [&>span:first-child]:flex-1 [&>span:first-child]:justify-center">
                      {busy ? (sent ? 'Checking…' : 'Sending…') : sent ? (signup ? 'Create account' : 'Log in') : 'Email me a code'}
                    </Btn>
                    {sent && (
                      <div className="flex justify-between text-[13px] text-muted-foreground">
                        <button type="button" onClick={() => (setSent(null), setErrs({}))} className="transition-colors hover:text-foreground">Change email</button>
                        <button type="button" disabled={busy} onClick={() => send(sent.email, sent.name)} className="transition-colors hover:text-foreground">Resend code</button>
                      </div>
                    )}
                  </form>
                </div>
                <div className="flex h-12 items-center justify-center gap-2 border-t border-border text-[13px] text-muted-foreground">
                  {signup ? 'Have an account?' : 'No account?'}
                  <Link href={signup ? '/login' : '/signup'} className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                    {signup ? 'Log in' : 'Sign up'}
                  </Link>
                </div>
              </Brackets>
            </Item>
          </Stagger>
        </Spotlight>
      </section>
    </Frame>
  )
}

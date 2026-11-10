'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { $, ago } from '@/lib/api'
import { enable } from '@/lib/pc'
import { Btn, Input } from '@/components/ds'
import { Activity, LiveDot, useLedger } from '@/components/activity'
import { Block, Empty, errMsg, Field, Nothing, Num, Page, PageSkeleton, Skel, useApi, useUser } from '@/components/portal'
import { EndpointList, NewEndpoint, type Endpoint } from './endpoints'

type Payout = { id: string; gross: number; net: number; status: 'pending' | 'paid' | 'failed'; createdAt: string }
type Me = { seller: { id: string; name: string; paypalEmail: string; paidOut: number; pendingPayout: number }; earned: number; owed: number; payouts: Payout[] }

const MIN = 500_000 // server payout threshold
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EarnPage() {
  const { user, pending } = useUser()
  if (pending) return <PageSkeleton />
  if (!user?.sellerId) return <Enable />
  return <Earn />
}

function Enable() {
  const { refetch } = useUser()
  const [errs, setErrs] = useState<{ name?: string; email?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim(), paypalEmail = String(f.get('paypalEmail')).trim()
    const v = { name: !name ? 'Shown to buyers' : undefined, email: !EMAIL.test(paypalEmail) ? 'Enter a valid email' : undefined }
    setErrs(v)
    if (v.name || v.email) return
    setBusy(true)
    try {
      await enable({ role: 'seller', name, paypalEmail })
      await refetch()
      toast.success('Selling enabled', { description: `Payouts go to ${paypalEmail}` })
    } catch (err) {
      setErrs({ form: errMsg(err) })
      setBusy(false)
    }
  }

  return (
    <Empty title="Sell your API" sub="Put a price on any HTTPS endpoint. Agents pay per call; earnings pay out to your PayPal every 10 minutes.">
      <form onSubmit={submit} noValidate className="flex w-full flex-col gap-5 text-left">
        <Field label="Display name" id="s-name" error={errs.name}>
          <Input id="s-name" name="name" placeholder="Acme Weather" maxLength={100} aria-invalid={!!errs.name} />
        </Field>
        <Field label="PayPal email" id="s-email" error={errs.email} hint="Sandbox: use a sandbox PayPal account.">
          <Input id="s-email" name="paypalEmail" type="email" placeholder="you@example.com" aria-invalid={!!errs.email} />
        </Field>
        {errs.form && <p role="alert" className="text-xs text-destructive">{errs.form}</p>}
        <Btn type="submit" disabled={busy} className="mt-2 self-center">{busy ? 'Enabling…' : 'Enable selling'}</Btn>
      </form>
    </Empty>
  )
}

const tone = { paid: 'text-live', pending: 'text-foreground', failed: 'text-destructive' } as const

function Earn() {
  const me = useApi<Me>('seller', 'sellers/me')
  const eps = useApi<Endpoint[]>('seller', 'endpoints')
  const { rows, fresh, live } = useLedger('seller', () => me.reload())
  const d = me.data

  if (me.error && !d) return <Page><p className="text-sm text-destructive">Couldn&apos;t load your earnings: {me.error}</p></Page>

  const stats: [string, number | undefined][] = [['Earned', d?.earned], ['Owed', d?.owed], ['Paid out', d?.seller.paidOut]]

  return (
    <Page>
      <section>
        <div className="grid grid-cols-3 gap-4 sm:gap-10">
          {stats.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <h2 className="text-sm text-muted-foreground">{k}</h2>
              <div data-testid={`stat-${k.toLowerCase().replace(' ', '-')}`} className="mt-2 truncate text-[clamp(28px,6vw,56px)] font-light leading-none tracking-[-0.04em]">
                {v === undefined ? <Skel className="h-[1em] w-[3ch]" /> : <Num value={v} />}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          {d ? (
            <>
              Payouts to <span className="text-foreground">{d.seller.paypalEmail}</span> every 10 min once owed ≥ $0.50 · 2% fee
              {d.seller.pendingPayout > 0 && <> · <span className="font-mono">{$(d.seller.pendingPayout)}</span> in flight</>}
              {d.owed >= MIN && <span className="text-live"> · next payout soon</span>}
            </>
          ) : <Skel className="h-4 w-80 max-w-full" />}
        </p>
      </section>

      <Block title="Endpoints" aside={<NewEndpoint onCreated={eps.reload} />}>
        <EndpointList list={eps.data} reload={eps.reload} />
      </Block>

      <Block title="Payouts">
        {!d ? <Skel className="h-12" /> : d.payouts.length === 0 ? <Nothing>First payout once you&apos;re owed $0.50.</Nothing> : (
          <ul className="border-t border-border">
            {d.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
                <span className="min-w-0">
                  <span className="block text-sm">Payout to PayPal <span className={`text-xs ${tone[p.status]}`}>· {p.status}</span></span>
                  <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                    <span className="font-mono">{$(p.gross)}</span> less <span className="font-mono">{$(p.gross - p.net)}</span> fee · {ago(p.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm">{$(p.net)}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Activity" aside={<LiveDot live={live} />}>
        <Activity role="seller" rows={rows} fresh={fresh} />
      </Block>
    </Page>
  )
}

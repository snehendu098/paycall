'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { $, toDollars, toMicros } from '@/lib/api'
import { enable, pc } from '@/lib/pc'
import { Btn, Input } from '@/components/ds'
import { Activity, LiveDot, useLedger } from '@/components/activity'
import { Act, Block, Empty, errMsg, Field, Num, Page, PageSkeleton, PDialog, Skel, useApi, useUser } from '@/components/portal'
import { AddAgent, AgentList, type Agent } from './agents'
import { TopUp } from './topup'

type Owner = { id: string; email: string; balance: number; vaultId: string | null; reloadBelow: number; reloadAmount: number; dailyCap: number }
type Me = { owner: Owner; agents: Agent[]; spendBySeller: { sellerId: string; spent: number }[] }

export default function SpendPage() {
  const { user, pending, refetch } = useUser()
  const [busy, setBusy] = useState(false)
  if (pending) return <PageSkeleton />
  if (!user?.ownerId)
    return (
      <Empty title="Start paying for APIs" sub="Fund a balance with PayPal once. Your agents pay per call with signed vouchers, within the limits you set.">
        <Btn
          disabled={busy}
          onClick={() => {
            setBusy(true)
            enable({ role: 'buyer' }).then(
              () => refetch().then(() => toast.success('Wallet created')),
              (e) => { toast.error("Couldn't enable spending", { description: errMsg(e) }); setBusy(false) },
            )
          }}
        >
          {busy ? 'Enabling…' : 'Enable'}
        </Btn>
      </Empty>
    )
  return <Spend />
}

const sinceUtcMidnight = () => new Date().setUTCHours(0, 0, 0, 0)

function Spend() {
  const me = useApi<Me>('buyer', 'owners/me')
  const { rows, fresh, live } = useLedger('buyer', () => me.reload())
  const [settings, setSettings] = useState(false)
  const o = me.data?.owner
  const names = Object.fromEntries(me.data?.agents.map((a) => [a.pubkey, a.name]) ?? [])
  // server cap window = UTC day (date_trunc on db clock)
  const today = (rows ?? []).filter((e) => e.type === 'charge' && +new Date(e.createdAt) >= sinceUtcMidnight()).reduce((s, e) => s + e.amount, 0)

  if (me.error && !me.data) return <Page><p className="text-sm text-destructive">Couldn&apos;t load your wallet: {me.error}</p></Page>

  return (
    <Page>
      <section className="grid gap-10 md:grid-cols-[1fr_320px] md:items-end">
        <div className="min-w-0">
          <h1 className="text-sm text-muted-foreground">Balance</h1>
          <div data-testid="balance" className="mt-3 text-[clamp(56px,9vw,96px)] font-light leading-none tracking-[-0.05em]">
            {o ? <Num value={o.balance} /> : <Skel className="h-[1em] w-[4ch]" />}
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            {o ? <><span className="font-mono text-foreground">{$(today)}</span> spent today of <span className="font-mono">{$(o.dailyCap)}</span></> : <Skel className="h-4 w-56" />}
          </div>
          {o && (
            <button type="button" onClick={() => setSettings(true)} className="group mt-4 inline-flex items-center gap-2.5 border border-border px-3 py-2 text-sm transition-colors hover:border-foreground/40">
              <span className={`size-1.5 ${o.reloadBelow > 0 && o.vaultId ? 'bg-live' : 'bg-muted-foreground/50'}`} />
              {o.reloadBelow === 0 ? (
                <span className="text-muted-foreground">Auto-reload off</span>
              ) : (
                <span>
                  Auto-reload {o.vaultId ? 'on' : 'set'} <span className="text-muted-foreground">· <span className="font-mono">+{$(o.reloadAmount)}</span> when below <span className="font-mono">{$(o.reloadBelow)}</span>{!o.vaultId && ' · starts after first top-up'}</span>
                </span>
              )}
              <span className="text-muted-foreground transition-colors group-hover:text-foreground">Edit</span>
            </button>
          )}
        </div>
        <div>{o ? <TopUp onDone={me.reload} /> : <Skel className="h-24" />}</div>
      </section>

      {o && (
        <PDialog open={settings} onOpenChange={setSettings} title="Auto-reload & limits" description="Reloads charge your saved PayPal wallet.">
          <Limits key={o.id} owner={o} onSaved={() => { setSettings(false); me.reload() }} />
        </PDialog>
      )}

      <Block title="Agents" aside={<AddAgent />}>
        <AgentList agents={me.data?.agents} reload={me.reload} />
      </Block>

      <Block title="Activity" aside={<LiveDot live={live} />}>
        <Activity role="buyer" rows={rows} fresh={fresh} names={names} />
      </Block>
    </Page>
  )
}

const MONEY = /^\d+(\.\d{1,6})?$/
const fields = [
  { k: 'reloadBelow', label: 'Reload when below', hint: 'Set $0 to turn auto-reload off.', min: 0 },
  { k: 'reloadAmount', label: 'Reload amount', hint: 'Minimum $1.', min: 1e6 },
  { k: 'dailyCap', label: 'Daily spend cap', hint: 'Across all agents, per UTC day.', min: 0 },
] as const
type K = (typeof fields)[number]['k']

function Limits({ owner, onSaved }: { owner: Owner; onSaved: () => void }) {
  const [errs, setErrs] = useState<Partial<Record<K, string>>>({})
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body: Partial<Record<K, number>> = {}
    const bad: Partial<Record<K, string>> = {}
    for (const { k, min } of fields) {
      const v = String(f.get(k)).trim()
      if (!MONEY.test(v)) bad[k] = 'Enter a dollar amount'
      else if (toMicros(v) < min) bad[k] = `At least ${$(min)}`
      else body[k] = toMicros(v)
    }
    setErrs(bad)
    if (Object.keys(bad).length) return
    setBusy(true)
    try {
      await pc('buyer', 'owners/me', { method: 'PATCH', body })
      toast.success('Limits saved')
      onSaved()
    } catch (e) {
      toast.error("Couldn't save limits", { description: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5">
      {fields.map(({ k, label, hint }) => (
        <Field key={k} label={label} id={k} hint={hint} error={errs[k]}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
            <Input id={k} name={k} inputMode="decimal" defaultValue={toDollars(owner[k])} aria-invalid={!!errs[k]} className="pl-7 font-mono" />
          </div>
        </Field>
      ))}
      <div className="flex justify-end pt-1">
        <Act primary type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Act>
      </div>
    </form>
  )
}

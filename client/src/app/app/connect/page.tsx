'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { $, short, toMicros } from '@/lib/api'
import { enable, pc } from '@/lib/pc'
import { Input } from '@/components/ds'
import { Act, errMsg, Field, Page, PageSkeleton, useUser } from '@/components/portal'

type Pending = { userCode: string; name: string; pubkey: string; replaces: string | null; expiresAt: string }
const PRICE = /^\d+(\.\d{1,6})?$/

// code typed by hand on purpose: a prefilled link could carry an attacker's key (rfc 8628 §5.4)
export default function Connect() {
  const { user, pending, refetch } = useUser()
  const [code, setCode] = useState('')
  const [req, setReq] = useState<Pending | null>(null)
  const [done, setDone] = useState<{ name: string; maxPrice: number } | null>(null)
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function lookup(e: FormEvent) {
    e.preventDefault()
    setErr(undefined)
    setBusy(true)
    try {
      if (!user?.ownerId) await enable({ role: 'buyer' }).then(() => refetch()) // first time: make wallet
      setReq(await pc<Pending>('buyer', `device/${encodeURIComponent(code.trim())}`))
    } catch (e) {
      setErr(/404|unknown/i.test(errMsg(e)) ? 'That code is wrong or expired. Run login again for a new one.' : errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function approve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const mp = String(new FormData(e.currentTarget).get('maxPrice')).trim()
    if (mp && !PRICE.test(mp)) return setErr('Max price: dollars, up to 6 decimals')
    setErr(undefined)
    setBusy(true)
    try {
      const a = await pc<{ name: string; maxPrice: number }>('buyer', `device/${req!.userCode}/approve`, { body: mp ? { maxPrice: toMicros(mp) } : {} })
      setDone(a)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (pending) return <PageSkeleton />

  return (
    <Page className="max-w-md py-20 md:py-28">
      {done ? (
        <div data-testid="connected">
          <h1 className="text-[40px] font-light leading-tight tracking-[-0.03em]">Connected</h1>
          <p className="mt-4 text-muted-foreground">
            <span className="text-foreground">{done.name}</span> can now pay up to <span className="font-mono text-foreground">{$(done.maxPrice)}</span> per call from your balance. Head back to your terminal.
          </p>
          <Link href="/app/spend" className="mt-10 inline-block text-sm underline decoration-border underline-offset-4 hover:decoration-foreground">Go to Spend</Link>
        </div>
      ) : !req ? (
        <form onSubmit={lookup} noValidate>
          <h1 className="text-[40px] font-light leading-tight tracking-[-0.03em]">Connect an agent</h1>
          <p className="mt-4 text-muted-foreground">Enter the code shown in your terminal or by Claude.</p>
          <div className="mt-10 flex flex-col gap-5">
            <Field label="Code" id="code" error={err}>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WDJB-MJHT" maxLength={9} autoFocus autoComplete="off" spellCheck={false} aria-invalid={!!err} className="h-12 font-mono text-lg tracking-[0.3em]" />
            </Field>
            <Act primary type="submit" disabled={busy || code.replace(/[^A-Z]/g, '').length !== 8} className="h-11">{busy ? 'Checking…' : 'Continue'}</Act>
          </div>
        </form>
      ) : (
        <form onSubmit={approve} noValidate data-testid="approve">
          <h1 className="text-[40px] font-light leading-tight tracking-[-0.03em]">Connect {req.name}?</h1>
          <p className="mt-4 text-muted-foreground">It will pay for API calls from your PayCall balance, within your daily cap.</p>
          <dl className="mt-8 border-t border-border text-sm">
            <div className="flex justify-between gap-4 border-b border-border py-3"><dt className="text-muted-foreground">Code</dt><dd className="font-mono">{req.userCode}</dd></div>
            <div className="flex justify-between gap-4 border-b border-border py-3"><dt className="text-muted-foreground">Key</dt><dd className="font-mono" title={req.pubkey}>{short(req.pubkey)}</dd></div>
            {req.replaces && <div className="flex justify-between gap-4 border-b border-border py-3"><dt className="text-muted-foreground">Replaces</dt><dd className="font-mono" title={req.replaces}>{short(req.replaces)} · will be paused</dd></div>}
          </dl>
          <div className="mt-6">
            <Field label="Max price per call (optional)" id="maxPrice" hint="It refuses any API priced above this. Default $1.00." error={err}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
                <Input id="maxPrice" name="maxPrice" inputMode="decimal" placeholder="0.05" className="pl-7 font-mono" />
              </div>
            </Field>
          </div>
          <div className="mt-8 flex gap-3">
            <Act primary type="submit" disabled={busy} className="h-11 flex-1">{busy ? 'Connecting…' : 'Approve'}</Act>
            <Act onClick={() => { setReq(null); setErr(undefined) }} className="h-11">Cancel</Act>
          </div>
          <p className="mt-6 text-xs text-muted-foreground/80">Only approve a code you started yourself.</p>
        </form>
      )}
    </Page>
  )
}

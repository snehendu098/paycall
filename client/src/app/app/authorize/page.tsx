'use client'

import { use, useEffect, useState, type FormEvent } from 'react'
import { toMicros } from '@/lib/api'
import { enable, pc } from '@/lib/pc'
import { Input } from '@/components/ds'
import { Act, errMsg, Field, Page, PageSkeleton, useUser } from '@/components/portal'

type Tx = { clientName: string | null; redirectHost: string; scope: string[] }
const PRICE = /^\d+(\.\d{1,6})?$/
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const EXPIRED = 'This sign-in link expired. Start again from Claude.'
const h1 = 'text-[40px] font-light leading-tight tracking-[-0.03em]'

/** OAuth consent for hosted MCP clients (Claude Code etc). */
export default function Authorize({ searchParams }: { searchParams: Promise<{ tx?: string | string[] }> }) {
  const tx = use(searchParams).tx
  const id = typeof tx === 'string' ? encodeURIComponent(tx) : ''
  const { user, pending, refetch } = useUser()
  const [req, setReq] = useState<Tx>()
  const [loadErr, setLoadErr] = useState<string>()
  const fatal = id ? loadErr : EXPIRED
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState<'approve' | 'deny'>()

  useEffect(() => {
    if (pending || req || !id) return
    ;(async () => {
      if (!user?.ownerId) await enable({ role: 'buyer' }).then(() => refetch()) // first time: make wallet
      setReq(await pc<Tx>('buyer', `oauth/tx/${id}`))
    })().catch((e) => setLoadErr(/404|expired|unknown|not_found/i.test(errMsg(e)) ? EXPIRED : errMsg(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, id])

  async function go(kind: 'approve' | 'deny', body?: object) {
    setErr(undefined)
    setBusy(kind)
    try {
      const r = await pc<{ redirectTo: string }>('buyer', `oauth/tx/${id}/${kind === 'approve' ? 'complete' : 'deny'}`, { method: 'POST', body })
      window.location.href = r.redirectTo // busy stays on; navigating away
    } catch (e) {
      setErr(/404|expired/i.test(errMsg(e)) ? EXPIRED : errMsg(e))
      setBusy(undefined)
    }
  }

  function approve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim(), mp = String(f.get('maxPrice')).trim()
    if (!name || name.length > 64) return setErr('Agent name: 1 to 64 characters')
    if (mp && !PRICE.test(mp)) return setErr('Max price: dollars, up to 6 decimals')
    go('approve', mp ? { name, maxPrice: toMicros(mp) } : { name })
  }

  if (fatal) return (
    <Page className="max-w-md py-20 md:py-28">
      <div data-testid="expired">
        <h1 className={h1}>Can&apos;t connect</h1>
        <p className="mt-4 text-muted-foreground">{fatal}</p>
      </div>
    </Page>
  )
  if (!req) return <PageSkeleton />

  const app = req.clientName ?? 'an app'
  const row = 'flex justify-between gap-4 border-b border-border py-3'
  return (
    <Page className="max-w-md py-20 md:py-28">
      <form onSubmit={approve} noValidate data-testid="authorize">
        <h1 className={h1}>Connect {app} to PayCall?</h1>
        <p className="mt-4 text-muted-foreground">It will pay for API calls from your PayCall balance, within your daily cap.</p>
        <dl className="mt-8 border-t border-border text-sm">
          <div className={row}><dt className="text-muted-foreground">App</dt><dd className="truncate">{req.clientName ?? 'Unnamed app'}</dd></div>
          <div className={row}><dt className="text-muted-foreground">Returns to</dt><dd className="truncate font-mono">{req.redirectHost}</dd></div>
        </dl>
        {!LOCAL.test(req.redirectHost) && <p className="mt-3 text-xs text-muted-foreground">Only approve if you started this from your own app.</p>}
        <div className="mt-6 flex flex-col gap-5">
          <Field label="Agent name" id="name">
            <Input id="name" name="name" defaultValue={req.clientName ?? 'claude'} maxLength={64} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Max price per call (optional)" id="maxPrice" hint="It refuses any API priced above this. Default $1.00." error={err}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
              <Input id="maxPrice" name="maxPrice" inputMode="decimal" placeholder="0.05" className="pl-7 font-mono" />
            </div>
          </Field>
        </div>
        <div className="mt-8 flex gap-3">
          <Act primary type="submit" disabled={!!busy} className="h-11 flex-1">{busy === 'approve' ? 'Connecting…' : 'Approve'}</Act>
          <Act onClick={() => go('deny')} disabled={!!busy} className="h-11">{busy === 'deny' ? 'Denying…' : 'Deny'}</Act>
        </div>
        {busy && <p className="mt-6 text-xs text-muted-foreground/80">Returning to {req.clientName ?? 'the app'}…</p>}
      </form>
    </Page>
  )
}

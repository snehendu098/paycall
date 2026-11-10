'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { $, API, short, toDollars, toMicros } from '@/lib/api'
import { pc } from '@/lib/pc'
import { Code, Input } from '@/components/ds'
import { Act, errMsg, Nothing, PDialog, Skel } from '@/components/portal'
import { Switch } from '@/components/shadcn/switch'

export type Agent = { pubkey: string; name: string; paused: boolean; maxPrice: number; createdAt: string }

const MCP_PATH = process.env.NEXT_PUBLIC_MCP_PATH ?? '/path/to/paycall-mcp/src/index.ts'
const PRICE = /^\d+(\.\d{1,6})?$/
/** Agents list: name + key, inline max price, active switch. */
export function AgentList({ agents, reload }: { agents?: Agent[]; reload: () => void }) {
  if (!agents) return <div className="flex flex-col gap-3 border-t border-border pt-4"><Skel className="h-12" /><Skel className="h-12" /></div>
  if (agents.length === 0) return <Nothing>No agents yet. Add one to give Claude or any SDK client a wallet key.</Nothing>
  const sorted = [...agents].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
  return <ul className="border-t border-border">{sorted.map((a) => <AgentRow key={a.pubkey} a={a} reload={reload} />)}</ul>
}

function AgentRow({ a, reload }: { a: Agent; reload: () => void }) {
  const [paused, setPaused] = useState(a.paused)
  const [price, setPrice] = useState(toDollars(a.maxPrice))
  const [busy, setBusy] = useState(false)
  const bad = !PRICE.test(price.trim())

  async function patch(body: { paused?: boolean; maxPrice?: number }, ok: string) {
    setBusy(true)
    try {
      await pc('buyer', `agents/${a.pubkey}`, { method: 'PATCH', body })
      toast.success(ok)
      reload()
      return true
    } catch (e) {
      toast.error(`Couldn't update ${a.name}`, { description: errMsg(e) })
      return false
    } finally {
      setBusy(false)
    }
  }

  // optimistic; roll back on failure
  async function toggle(on: boolean) {
    setPaused(!on)
    if (!(await patch({ paused: !on }, `${a.name} ${on ? 'resumed' : 'paused'}`))) setPaused(on)
  }

  function savePrice(e?: FormEvent) {
    e?.preventDefault()
    if (bad) return
    const m = toMicros(price)
    if (m === a.maxPrice) return
    patch({ maxPrice: m }, `${a.name} max price ${$(m)}`)
  }

  return (
    <li data-testid="agent" className="flex items-center gap-4 border-b border-border py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{a.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground" title={a.pubkey}>{short(a.pubkey)}</div>
      </div>
      <form onSubmit={savePrice} className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">Max / call</span>
        <div className="relative w-24">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">$</span>
          <Input
            aria-label={`Max price per call for ${a.name}`}
            aria-invalid={bad}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => savePrice()}
            className={cn('h-8 pl-6 font-mono text-xs md:text-xs', bad && 'border-destructive')}
          />
        </div>
      </form>
      <Switch checked={!paused} disabled={busy} onCheckedChange={toggle} aria-label={`${paused ? 'Resume' : 'Pause'} ${a.name}`} className="data-checked:bg-live" />
    </li>
  )
}

/** "Add agent" dialog: hosted MCP over OAuth; SDK scripts use device login + /app/connect. */
export function AddAgent() {
  const [open, setOpen] = useState(false)
  const wrap = '[&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:text-[12px]'
  return (
    <>
      <Act onClick={() => setOpen(true)}>Add agent</Act>
      <PDialog open={open} onOpenChange={setOpen} wide title="Connect an agent" description="Add PayCall to Claude, then approve it in your browser.">
        <ol className="flex flex-col gap-6 text-[13px]" data-testid="snippet">
          <li className="flex flex-col gap-2">
            <span className="text-muted-foreground">1 · Add the PayCall MCP server (Claude Code)</span>
            <Code text={`claude mcp add --transport http paycall ${API}/mcp`} className={wrap} />
            <span className="text-xs text-muted-foreground/80">Claude Desktop or another MCP client: add the same URL as a remote MCP server.</span>
          </li>
          <li className="flex flex-col gap-2">
            <span className="text-muted-foreground">2 · In Claude Code run <span className="font-mono text-foreground">/mcp</span> → paycall → Authenticate. Your browser opens; approve.</span>
          </li>
        </ol>
        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground/80">
          <span>For SDK scripts (no browser sign-in): run this, then enter the code on the <Link href="/app/connect" onClick={() => setOpen(false)} className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">connect page</Link>.</span>
          <Code text={`bun run ${MCP_PATH} login`} className={wrap} />
        </div>
      </PDialog>
    </>
  )
}

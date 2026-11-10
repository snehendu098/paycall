'use client'

import { useEffect, useState } from 'react'
import { $, api, b64url, short, toDollars, toMicros } from '@/lib/api'
import { btn, btnGhost, Card, Code, Err, Field, Header, input, submit, useData, useSession } from '@/components/ui'
import { Ledger } from '@/components/ledger'

type Agent = { pubkey: string; ownerId: string; name: string; paused: boolean; maxPrice: number; createdAt: string }
type Me = {
  owner: { id: string; email: string; balance: number; vaultId: string | null; reloadBelow: number; reloadAmount: number; dailyCap: number }
  agents: Agent[]
  spendBySeller: { sellerId: string; spent: number }[]
}

const MCP_PATH = process.env.NEXT_PUBLIC_MCP_PATH ?? '/path/to/main/paycall-mcp/src/index.ts'

export default function Buyer() {
  const { key, logout } = useSession('buyer')
  if (!key) return null
  return <Dashboard apiKey={key} logout={logout} />
}

function Dashboard({ apiKey, logout }: { apiKey: string; logout: () => void }) {
  const { data, err, refresh } = useData<Me>('/owners/me', apiKey)
  useEffect(() => { if (err === 'invalid api key') logout() }, [err, logout])

  return (
    <>
      <Header who={data?.owner.email ?? 'buyer'} onLogout={logout} />
      <Err msg={err} />
      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Balance">
              <p className="text-5xl font-semibold tracking-tight tabular-nums" data-testid="balance">{$(data.owner.balance)}</p>
              <TopUp apiKey={apiKey} />
            </Card>
            <Agents apiKey={apiKey} agents={data.agents} refresh={refresh} />
            <Ledger apiKey={apiKey} onEvent={refresh} />
          </div>
          <div className="space-y-6">
            <AutoReload apiKey={apiKey} owner={data.owner} refresh={refresh} />
            <Card title="Spend by seller">
              {data.spendBySeller.length === 0 ? (
                <p className="text-sm text-zinc-500">No spend yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.spendBySeller.map((s) => (
                    <li key={s.sellerId} className="flex justify-between">
                      <span className="font-mono text-xs text-zinc-500">{short(s.sellerId)}</span>
                      <span className="tabular-nums">{$(s.spent)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

function TopUp({ apiKey }: { apiKey: string }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go(fd: FormData) {
    setBusy(true); setErr(null)
    try {
      const { orderId } = await api<{ orderId: string }>('/topup/create', { key: apiKey, body: { amount: toMicros(String(fd.get('amount'))) } })
      window.location.assign(`https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`)
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }
  return (
    <form onSubmit={submit(go)} className="mt-5 flex flex-wrap items-end gap-2">
      <Field label="Top up ($1–$500)">
        <input name="amount" type="number" min="1" max="500" step="0.01" defaultValue="5" required className={`${input} max-w-32`} />
      </Field>
      <button className={btn} disabled={busy}>{busy ? 'Redirecting…' : 'Top up with PayPal'}</button>
      <div className="w-full"><Err msg={err} /></div>
    </form>
  )
}

function AutoReload({ apiKey, owner, refresh }: { apiKey: string; owner: Me['owner']; refresh: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  async function save(fd: FormData) {
    setErr(null); setSaved(false)
    try {
      await api('/owners/me', {
        key: apiKey, method: 'PATCH',
        body: Object.fromEntries(['reloadBelow', 'reloadAmount', 'dailyCap'].map((k) => [k, toMicros(String(fd.get(k)))])),
      })
      setSaved(true); refresh()
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <Card title="Auto-reload">
      <p className={`mb-4 text-sm ${owner.vaultId ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`} data-testid="vault">
        {owner.vaultId ? 'Wallet saved ✓' : 'First top-up saves your PayPal wallet.'}
      </p>
      <form onSubmit={submit(save)} className="space-y-3">
        <Field label="Reload when below ($)">
          <input name="reloadBelow" type="number" min="0" step="0.01" defaultValue={toDollars(owner.reloadBelow)} className={input} />
        </Field>
        <Field label="Reload amount ($, min 1)">
          <input name="reloadAmount" type="number" min="1" step="0.01" defaultValue={toDollars(owner.reloadAmount)} className={input} />
        </Field>
        <Field label="Daily spend cap ($)">
          <input name="dailyCap" type="number" min="0" step="0.01" defaultValue={toDollars(owner.dailyCap)} className={input} />
        </Field>
        <button className={`${btn} w-full`}>{saved ? 'Saved ✓' : 'Save'}</button>
      </form>
      <Err msg={err} />
    </Card>
  )
}

function Agents({ apiKey, agents, refresh }: { apiKey: string; agents: Agent[]; refresh: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState<{ name: string; priv: string } | null>(null)

  async function add(fd: FormData) {
    setErr(null)
    try {
      const kp = (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair
      const pubkey = b64url(await crypto.subtle.exportKey('raw', kp.publicKey))
      const priv = b64url(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
      const name = String(fd.get('name'))
      const mp = String(fd.get('maxPrice') ?? '')
      await api('/agents', { key: apiKey, body: { pubkey, name, ...(mp ? { maxPrice: toMicros(mp) } : {}) } })
      setCreated({ name, priv }); refresh()
    } catch (e) { setErr((e as Error).message) }
  }

  async function patch(pubkey: string, body: { paused?: boolean; maxPrice?: number }) {
    setErr(null)
    try { await api(`/agents/${pubkey}`, { key: apiKey, method: 'PATCH', body }); refresh() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <Card title="Agents">
      {agents.length > 0 && (
        <ul className="mb-5 divide-y divide-zinc-100 dark:divide-zinc-800">
          {agents.map((a) => (
            <li key={a.pubkey} className="flex flex-wrap items-center gap-3 py-3 text-sm" data-testid="agent">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.name}</p>
                <p className="font-mono text-xs text-zinc-500">{short(a.pubkey)}</p>
              </div>
              <form
                onSubmit={submit((fd) => patch(a.pubkey, { maxPrice: toMicros(String(fd.get('mp'))) }))}
                className="flex items-center gap-1"
              >
                <span className="text-xs text-zinc-500">max $</span>
                <input name="mp" type="number" min="0" step="0.000001" defaultValue={toDollars(a.maxPrice)} className={`${input} max-w-28 py-1`} />
                <button className={btnGhost}>Set</button>
              </form>
              <button
                role="switch"
                aria-checked={!a.paused}
                aria-label={`${a.paused ? 'Resume' : 'Pause'} ${a.name}`}
                onClick={() => patch(a.pubkey, { paused: !a.paused })}
                className={`relative h-6 w-11 rounded-full transition ${a.paused ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-emerald-500'}`}
              >
                <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${a.paused ? 'left-0.5' : 'left-5.5'}`} />
              </button>
              <span className="w-14 text-xs text-zinc-500">{a.paused ? 'paused' : 'active'}</span>
            </li>
          ))}
        </ul>
      )}
      {created ? (
        <AgentSnippet {...created} onDone={() => setCreated(null)} />
      ) : (
        <form onSubmit={submit(add)} className="flex flex-wrap items-end gap-2">
          <Field label="Agent name"><input name="name" required maxLength={64} placeholder="claude" className={input} /></Field>
          <Field label="Max price/call ($, optional)"><input name="maxPrice" type="number" min="0" step="0.000001" className={`${input} max-w-36`} /></Field>
          <button className={btn}>Add agent</button>
        </form>
      )}
      <Err msg={err} />
    </Card>
  )
}

function AgentSnippet({ name, priv, onDone }: { name: string; priv: string; onDone: () => void }) {
  const cli = `claude mcp add paycall -e PAYCALL_AGENT_KEY=${priv} -- bun run ${MCP_PATH}`
  const desktop = JSON.stringify(
    { mcpServers: { paycall: { command: 'bun', args: ['run', MCP_PATH], env: { PAYCALL_AGENT_KEY: priv } } } },
    null, 2,
  )
  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/30" data-testid="snippet">
      <p className="text-sm font-medium">Agent “{name}” created.</p>
      <p className="text-sm text-amber-800 dark:text-amber-300">
        Its private key was generated in your browser and is shown <b>only now</b>. It was never sent to the server and can&apos;t be recovered.
      </p>
      <p className="text-xs font-semibold text-zinc-500 uppercase">Claude Code</p>
      <Code text={cli} />
      <p className="text-xs font-semibold text-zinc-500 uppercase">Claude Desktop (claude_desktop_config.json)</p>
      <Code text={desktop} />
      <button className={btnGhost} onClick={onDone}>Done, I saved it</button>
    </div>
  )
}

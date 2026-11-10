'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, roleOf, setKey } from '@/lib/api'
import { btn, btnGhost, Card, Code, Err, Field, input, submit, useKey } from '@/components/ui'

type Role = 'buyer' | 'seller'

export default function Home() {
  const router = useRouter()
  const [newKey, setNewKey] = useState<{ key: string; role: Role } | null>(null)
  const existingRole = roleOf(useKey())

  if (newKey)
    return (
      <div className="mx-auto max-w-xl">
        <Card title="Your API key">
          <p className="mb-3 text-sm">Save this, it&apos;s your login. It is shown only once.</p>
          <Code text={newKey.key} />
          <button className={`${btn} mt-4 w-full`} onClick={() => router.push(`/${newKey.role}`)}>
            I saved it, continue
          </button>
        </Card>
      </div>
    )

  return (
    <div className="space-y-10">
      <div className="pt-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">PayCall</h1>
        <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
          Pay-per-call for AI agents, settled on PayPal. Buyers prepay a balance their agents spend per request.
          Sellers put a price on any API and get paid out automatically.
        </p>
        {existingRole && (
          <button className={`${btnGhost} mt-4`} onClick={() => router.push(`/${existingRole}`)}>
            Continue to {existingRole} dashboard →
          </button>
        )}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Signup role="buyer" onKey={(key) => { setKey(key); setNewKey({ key, role: 'buyer' }) }} />
        <Signup role="seller" onKey={(key) => { setKey(key); setNewKey({ key, role: 'seller' }) }} />
      </div>
    </div>
  )
}

function Signup({ role, onKey }: { role: Role; onKey: (k: string) => void }) {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signup(fd: FormData) {
    setBusy(true); setErr(null)
    try {
      const body = role === 'buyer'
        ? { email: fd.get('email') }
        : { name: fd.get('name'), paypalEmail: fd.get('paypalEmail') }
      const r = await api<{ apiKey: string }>(role === 'buyer' ? '/owners' : '/sellers', { body, key: null })
      onKey(r.apiKey)
    } catch (e) {
      setErr((e as Error).message === 'already_exists' ? 'Account already exists. Paste your key below.' : (e as Error).message)
    } finally { setBusy(false) }
  }

  async function login(fd: FormData) {
    const key = String(fd.get('key') ?? '').trim()
    setErr(null)
    if (roleOf(key) !== role) return setErr(`That isn't a ${role} key.`)
    try {
      await api(role === 'buyer' ? '/owners/me' : '/sellers/me', { key })
      setKey(key)
      router.push(`/${role}`)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <Card title={role === 'buyer' ? "I'm a buyer" : "I'm a seller"}>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {role === 'buyer'
          ? 'Fund a balance with PayPal and let your AI agents pay per call.'
          : 'Monetize an API endpoint. Earnings go straight to your PayPal.'}
      </p>
      <form onSubmit={submit(signup)} className="space-y-3">
        {role === 'buyer' ? (
          <Field label="Email"><input name="email" type="email" required className={input} /></Field>
        ) : (
          <>
            <Field label="Name"><input name="name" required maxLength={64} className={input} /></Field>
            <Field label="PayPal email"><input name="paypalEmail" type="email" required className={input} /></Field>
          </>
        )}
        <button className={`${btn} w-full`} disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
      </form>
      <form onSubmit={submit(login)} className="mt-4 flex gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <input name="key" placeholder={`Paste ${role === 'buyer' ? 'pc_owner_' : 'pc_seller_'}… key`} required className={`${input} font-mono`} />
        <button className={btnGhost}>Log in</button>
      </form>
      <Err msg={err} />
    </Card>
  )
}

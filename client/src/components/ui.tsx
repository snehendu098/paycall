'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { api, clearKey, getKey, roleOf } from '@/lib/api'

export const input =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900'
export const btn =
  'inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50'
export const btnGhost =
  'inline-flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800'

export function Card({ title, children, className = '' }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 ${className}`}>
      {title && <h2 className="mb-4 text-sm font-semibold tracking-wide text-zinc-500 uppercase">{title}</h2>}
      {children}
    </section>
  )
}

export function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={btnGhost}
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}

export function Code({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-zinc-100 p-3 font-mono text-xs break-all whitespace-pre-wrap dark:bg-zinc-950">{text}</pre>
      <Copy text={text} />
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

export function Err({ msg }: { msg: string | null }) {
  return msg ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{msg}</p> : null
}

export function Header({ who, onLogout }: { who: string; onLogout: () => void }) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">PayCall</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{who}</span>
      </div>
      <button className={btnGhost} onClick={onLogout}>Log out</button>
    </header>
  )
}

// GET path w/ key; refresh() refetches
export function useData<T>(path: string, key: string) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [v, setV] = useState(0)
  useEffect(() => {
    let live = true
    api<T>(path, { key }).then(
      (d) => { if (live) { setData(d); setErr(null) } },
      (e: Error) => { if (live) setErr(e.message) },
    )
    return () => { live = false }
  }, [path, key, v])
  return { data, err, refresh: () => setV((n) => n + 1) }
}

// key for role or bounce to /
export function useSession(role: 'buyer' | 'seller') {
  const router = useRouter()
  const key = useKey()
  const ok = roleOf(key) === role
  // read storage directly: first hydration pass sees server snapshot (null)
  useEffect(() => { if (roleOf(getKey()) !== role) router.replace('/') }, [role, router])
  const logout = () => { clearKey(); router.replace('/') }
  return { key: ok ? key! : null, logout }
}

// onSubmit w/o form reset (unlike action=)
export const submit = (fn: (fd: FormData) => unknown) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  fn(new FormData(e.currentTarget))
}

// localStorage key; null on server → no browser-only bailout needed
const sub = (cb: () => void) => { addEventListener('storage', cb); return () => removeEventListener('storage', cb) }
export const useKey = () => useSyncExternalStore(sub, getKey, () => null)

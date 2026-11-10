'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

// ?next (same-origin only) > signup ?sell=1 → /app/earn > /app
function dest(signup: boolean) {
  const q = new URLSearchParams(location.search)
  const next = q.get('next')
  if (next?.startsWith('/') && !next.startsWith('//')) return next
  return signup && q.get('sell') ? '/app/earn' : '/app'
}

export function AuthForm({ signup, google }: { signup?: boolean; google: boolean }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email')), password = String(f.get('password'))
    setBusy(true)
    setError('')
    const { error } = signup
      ? await authClient.signUp.email({ email, password, name: String(f.get('name')) })
      : await authClient.signIn.email({ email, password })
    setBusy(false)
    if (error) return setError(error.message ?? 'Something went wrong')
    router.push(dest(!!signup))
  }

  return (
    <>
      <form onSubmit={submit}>
        {signup && (
          <label>
            Name <input name="name" required autoComplete="name" />
          </label>
        )}
        <label>
          Email <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password{' '}
          <input name="password" type="password" required minLength={8} autoComplete={signup ? 'new-password' : 'current-password'} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{signup ? 'Create account' : 'Log in'}</button>
      </form>
      {google && (
        <button type="button" onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: dest(!!signup) })}>
          Continue with Google
        </button>
      )}
    </>
  )
}

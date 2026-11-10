'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { enable } from '@/lib/pc'

// placeholder; real portal later
export default function AppHome() {
  const router = useRouter()
  const { data, isPending, refetch } = authClient.useSession()
  const [error, setError] = useState('')

  if (isPending) return <p>Loading…</p>
  if (!data) return <p><a href="/login">Log in</a></p>
  const u = data.user

  const run = (body: Parameters<typeof enable>[0]) =>
    enable(body).then(() => refetch(), (e: Error) => setError(e.message))

  function sell(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    run({ role: 'seller', name: String(f.get('name')), paypalEmail: String(f.get('paypalEmail')) })
  }

  return (
    <main>
      <p>Signed in as {u.email}</p>
      <p>Buyer (ownerId): {u.ownerId ?? '—'}</p>
      <p>Seller (sellerId): {u.sellerId ?? '—'}</p>
      {!u.ownerId && <button onClick={() => run({ role: 'buyer' })}>Enable buying</button>}
      {!u.sellerId && (
        <form onSubmit={sell}>
          <label>
            Business name <input name="name" required />
          </label>
          <label>
            PayPal email <input name="paypalEmail" type="email" required />
          </label>
          <button type="submit">Enable selling</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <button onClick={() => authClient.signOut().then(() => router.push('/login'))}>Sign out</button>
    </main>
  )
}

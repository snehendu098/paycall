'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Card } from '@/components/ui'

export default function TopupReturn() {
  const router = useRouter()
  const token = useSearchParams().get('token')
  const [msg, setMsg] = useState<string | null>(token ? 'Confirming your payment…' : 'Missing order token.')
  const [failed, setFailed] = useState(!token)

  useEffect(() => {
    if (!token) return
    api<{ status: string; vaulted: boolean }>('/topup/capture', { body: { orderId: token } }).then(
      (r) => {
        if (r.status !== 'COMPLETED') throw new Error(`payment ${r.status}`)
        setMsg(r.vaulted ? 'Payment complete. Wallet saved for auto-reload.' : 'Payment complete.')
        setTimeout(() => router.replace('/buyer'), 1200)
      },
    ).catch((e: Error) => { setMsg(`Top-up failed: ${e.message}`); setFailed(true) })
  }, [token, router])

  return (
    <div className="mx-auto max-w-md">
      <Card title="Top-up">
        <p className="text-sm">{msg}</p>
        {failed && <Link href="/buyer" className="mt-4 inline-block text-sm text-emerald-600 underline">Back to dashboard</Link>}
      </Card>
    </div>
  )
}

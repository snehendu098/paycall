'use client'

import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from '@paypal/react-paypal-js'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { $, toMicros } from '@/lib/api'
import { pc } from '@/lib/pc'
import { Input } from '@/components/ds'
import { errMsg, Skel } from '@/components/portal'

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
const CHIPS = [5, 10, 25]

// $1–$500, whole cents → micros or null
const parse = (s: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(s.trim())) return null
  const m = toMicros(s)
  return m >= 1e6 && m <= 500e6 ? m : null
}

/** Amount chips + PayPal Smart Button (popup; page never navigates). */
export function TopUp({ onDone }: { onDone: () => void }) {
  const [chip, setChip] = useState<number | 'custom'>(5)
  const [custom, setCustom] = useState('')
  const amount = chip === 'custom' ? parse(custom) : chip * 1e6

  if (!CLIENT_ID) return <p className="text-sm text-destructive">NEXT_PUBLIC_PAYPAL_CLIENT_ID not set.</p>

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Top-up amount" className="grid grid-cols-4 gap-2">
        {[...CHIPS, 'custom' as const].map((c) => {
          const on = chip === c
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChip(c)}
              className={cn(
                'h-10 border font-mono text-[13px] tabular-nums transition-colors',
                on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground',
              )}
            >
              {c === 'custom' ? 'Other' : `$${c}`}
            </button>
          )
        })}
      </div>

      {chip === 'custom' && (
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
            <Input
              autoFocus
              inputMode="decimal"
              aria-label="Custom amount"
              aria-invalid={!!custom && !amount}
              placeholder="1.00 – 500.00"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-10 pl-7 font-mono"
            />
          </div>
          <span className={cn('text-xs', custom && !amount ? 'text-destructive' : 'text-muted-foreground')}>
            {custom && !amount ? 'Enter $1 to $500, whole cents.' : 'Between $1 and $500.'}
          </span>
        </div>
      )}

      <PayPalScriptProvider options={{ clientId: CLIENT_ID, currency: 'USD', intent: 'capture' }}>
        <Buttons amount={amount} onDone={onDone} />
      </PayPalScriptProvider>

    </div>
  )
}

// lib proxies props → callbacks always see latest amount
function Buttons({ amount, onDone }: { amount: number | null; onDone: () => void }) {
  const disabled = !amount
  const [{ isPending, isRejected }] = usePayPalScriptReducer()
  if (isRejected) return <p className="text-sm text-destructive">PayPal failed to load. Check your connection and reload.</p>
  return (
    <div className={cn('relative isolate z-0 min-h-11 transition-opacity', disabled && 'pointer-events-none opacity-40')}>
      {isPending && <Skel className="absolute inset-0 h-11" />}
      <PayPalButtons
        disabled={disabled}
        style={{ layout: 'horizontal', color: 'black', shape: 'rect', label: 'paypal', tagline: false, height: 44 }}
        createOrder={async () => {
          if (!amount) throw new Error('invalid amount')
          const { orderId } = await pc<{ orderId: string }>('buyer', 'topup/create', { body: { amount } })
          return orderId
        }}
        onApprove={async (data) => {
          const id = toast.loading('Confirming payment…')
          try {
            const r = await pc<{ status: string; vaulted: boolean }>('buyer', 'topup/capture', { body: { orderId: data.orderID } })
            if (r.status !== 'COMPLETED') throw new Error(`payment ${r.status.toLowerCase()}`)
            toast.success(`Added ${$(amount ?? 0)}`, { id, description: r.vaulted ? 'PayPal wallet saved · auto-reload on' : undefined })
            onDone()
          } catch (e) {
            toast.error('Top-up failed', { id, description: errMsg(e) })
          }
        }}
        onCancel={() => toast('Top-up cancelled')}
        onError={(e) => toast.error('PayPal error', { description: errMsg(e) })}
      />
    </div>
  )
}

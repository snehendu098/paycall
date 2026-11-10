import Link from 'next/link'
import { Card } from '@/components/ui'

export default function TopupCancel() {
  return (
    <div className="mx-auto max-w-md">
      <Card title="Top-up">
        <p className="text-sm">Top-up cancelled. No money was moved.</p>
        <Link href="/buyer" className="mt-4 inline-block text-sm text-emerald-600 underline">Back to dashboard</Link>
      </Card>
    </div>
  )
}

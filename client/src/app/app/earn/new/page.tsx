'use client'

import Link from 'next/link'
import { act, Empty, PageSkeleton, useUser } from '@/components/portal'
import { ListingForm } from '../listing'

export default function NewListingPage() {
  const { user, pending } = useUser()
  if (pending) return <PageSkeleton />
  if (!user?.sellerId) return <Empty title="Sell your API" sub="Enable selling first."><Link href="/app/earn" className={act(true)}>Go to Earn</Link></Empty>
  return <ListingForm />
}

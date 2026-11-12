'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import { act, Empty, Page, PageSkeleton, useApi, useUser } from '@/components/portal'
import type { Endpoint } from '../../endpoints'
import { ListingForm } from '../../listing'

function Edit() {
  const { id } = useParams<{ id: string }>()
  const { user, pending } = useUser()
  // ponytail: no GET /endpoints/:id, pick from own list (≤ a few dozen rows)
  const eps = useApi<Endpoint[]>('seller', 'endpoints', !!user?.sellerId)
  if (pending || (user?.sellerId && !eps.data && !eps.error)) return <PageSkeleton />
  if (eps.error) return <Page><p className="text-sm text-destructive">Couldn&apos;t load listing: {eps.error}</p></Page>
  const ep = eps.data?.find((e) => e.id === id)
  if (!ep) return <Empty title="Not found" sub="No listing with this id on your account."><Link href="/app/earn" className={act(true)}>Back to Earn</Link></Empty>
  return <ListingForm key={ep.id} ep={ep} />
}

export default function EditListingPage() {
  return <Suspense fallback={<PageSkeleton />}><Edit /></Suspense>
}

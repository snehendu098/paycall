'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageSkeleton, useUser } from '@/components/portal'

// seller-only accounts land on Earn, everyone else on Spend
export default function AppHome() {
  const router = useRouter()
  const { user, pending } = useUser()
  useEffect(() => {
    if (!pending) router.replace(user?.sellerId && !user.ownerId ? '/app/earn' : '/app/spend')
  }, [pending, user, router])
  return <PageSkeleton />
}

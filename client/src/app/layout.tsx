import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PayCall',
  description: 'Pay-per-call for AI agents, on PayPal.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <main className="mx-auto w-full max-w-5xl px-4 py-8">
          {/* boundary for useSearchParams (topup/return) */}
          <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>{children}</Suspense>
        </main>
      </body>
    </html>
  )
}

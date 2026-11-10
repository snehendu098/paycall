import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PayCall',
  description:
    'Pay-per-call for AI agents, settled on PayPal. Agents answer HTTP 402 with a signed voucher; sellers get paid out automatically. Built on x402.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {/* boundary for request-time hooks */}
        <Suspense fallback={null}>{children}</Suspense>
      </body>
    </html>
  )
}

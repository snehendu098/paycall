import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

// cookie presence only; real check in routes
export function proxy(req: NextRequest) {
  if (getSessionCookie(req)) return NextResponse.next()
  const url = new URL('/login', req.url)
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = { matcher: ['/app/:path*'] }

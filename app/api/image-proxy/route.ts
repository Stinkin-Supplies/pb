// Deprecated — redirects to /api/img which is the canonical proxy route.
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url param', { status: 400 })
  const dest = new URL('/api/img', req.url)
  dest.searchParams.set('u', url)
  return NextResponse.redirect(dest, { status: 301 })
}

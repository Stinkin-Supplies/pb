// app/api/image-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url || !url.startsWith('https://cdn.wpsstatic.com/')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const upstream = await fetch(url, {
    headers: {
      'Referer': 'https://cdn.wpsstatic.com/',
      'User-Agent': 'Mozilla/5.0',
    },
  })

  if (!upstream.ok) {
    return new NextResponse('Image unavailable', { status: 502 })
  }

  const blob = await upstream.arrayBuffer()
  return new NextResponse(blob, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
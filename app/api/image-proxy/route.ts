// app/api/image-proxy/route.ts
// Proxies CDN images which block direct browser hotlinking.

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = ['cdn.wpsstatic.com', 'asset.lemansnet.com']

function isAllowedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

// WPS CDN serves images directly in the browser — redirect, no proxy needed
const WPS_DIRECT = ['cdn.wpsstatic.com']

// LeMans requires the lepartsmartner.com referer and manual redirect following
const LEMANS_HEADERS = {
  'Referer':    'https://www.lepartsmartner.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept':     'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
}

async function fetchFollowingRedirects(url: string, headers: Record<string, string>, maxRedirects = 5): Promise<Response> {
  let currentUrl = url
  let hops = 0

  while (hops < maxRedirects) {
    const res = await fetch(currentUrl, {
      headers,
      cache: 'no-store',
      redirect: 'manual',
    })

    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const location = res.headers.get('location')
      if (!location) break

      // Resolve relative URLs
      currentUrl = location.startsWith('http')
        ? location
        : new URL(location, currentUrl).toString()

      console.log(`[image-proxy] redirect ${hops + 1}: ${currentUrl}`)
      hops++
      continue
    }

    return res
  }

  throw new Error(`Too many redirects for ${url}`)
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url)               return new NextResponse('Missing url param', { status: 400 })
  if (!isAllowedUrl(url)) return new NextResponse('Forbidden',         { status: 403 })

  try {
    const { hostname } = new URL(url)

    // WPS: redirect directly to CDN — browser loads it fine
    if (WPS_DIRECT.some(h => hostname === h || hostname.endsWith(`.${h}`))) {
      return NextResponse.redirect(url, { status: 302 })
    }

    // LeMans: proxy with manual redirect following + referer header
    if (hostname === 'asset.lemansnet.com' || hostname.endsWith('.lemansnet.com')) {
      try {
        const upstream = await fetchFollowingRedirects(url, LEMANS_HEADERS)
        const contentType = upstream.headers.get('content-type') ?? ''

        if (contentType.includes('zip') || contentType.includes('octet-stream')) {
          return NextResponse.redirect(new URL('/images/placeholder.jpg', req.url))
        }

        if (!upstream.ok) {
          console.warn(`[image-proxy] LeMans final status ${upstream.status} for ${url}`)
          return NextResponse.redirect(new URL('/images/placeholder.jpg', req.url))
        }

        const responseContentType = contentType || 'image/jpeg'
        const blob = await upstream.arrayBuffer()

        console.log(`[image-proxy] LeMans success — ${blob.byteLength} bytes, type: ${responseContentType}`)

        return new NextResponse(blob, {
          status: 200,
          headers: {
            'Content-Type':  responseContentType.startsWith('image/') ? responseContentType : 'image/jpeg',
            'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
            'Content-Length': blob.byteLength.toString(),
          },
        })
      } catch (err: any) {
        console.error(`[image-proxy] LeMans error for ${url}:`, err.message)
        return NextResponse.redirect(new URL('/images/placeholder.jpg', req.url))
      }
    }

  } catch (err: any) {
    console.error(`[image-proxy] error:`, err.message)
  }

  return NextResponse.redirect(new URL('/images/placeholder.jpg', req.url))
}

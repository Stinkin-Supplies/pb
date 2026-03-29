// lib/imageProxy.ts

const WPS_DOMAINS = ['cdn.wpsstatic.com']

export function shouldProxy(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return !WPS_DOMAINS.some(d => hostname.includes(d))
  } catch {
    return false
  }
}

/**
 * Returns a safe, publicly-loadable image URL.
 * WPS CDN works best directly in the browser; proxy only non-WPS hosts.
 * PU images (once imported) may serve directly; add their host to
 * PU_HOSTS below if they also block hotlinking.
 */
export function proxyImageUrl(url: string | null | undefined): string {
  if (!url) return '/images/placeholder.jpg'

  try {
    const parsed = new URL(url)
    const isWps = WPS_DOMAINS.some(d => parsed.hostname.includes(d))
    if (isWps) {
      return url
    }
    if (shouldProxy(url)) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
    }
  } catch {
    // malformed URL — fall through to placeholder
    return '/images/placeholder.jpg'
  }

  // All other URLs (your own CDN, Supabase Storage, etc.) serve directly
  return url
}

/**
 * Proxy-safe version of an images array.
 * Returns the first valid image, proxied if needed, or the placeholder.
 */
export function primaryImage(images: string[] | null | undefined): string {
  if (!images || images.length === 0) return '/images/placeholder.jpg'
  return proxyImageUrl(images[0])
}

/**
 * Map an entire images array through the proxy.
 */
export function proxyAllImages(images: string[] | null | undefined): string[] {
  if (!images || images.length === 0) return ['/images/placeholder.jpg']
  return images.map(proxyImageUrl)
}

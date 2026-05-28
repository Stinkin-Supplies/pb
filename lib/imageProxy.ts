// lib/imageProxy.ts
// All vendor CDN URLs that need proxying:
//   - LeMans (http, ZIP format)
//   - WPS (http — mixed content blocks on HTTPS pages)
//   - VTwin (may block hotlinking)
// Route all of these through /api/img to avoid mixed content and hotlink blocks.

const PROXY_DOMAINS = [
  'asset.lemansnet.com',
  'cdn.wpsstatic.com',
  'media.wpsstatic.com',
  'cdn.wps-inc.com',
  'assets.wps-inc.com',
  'img.wps-inc.com',
  'www.vtwinmfg.com',
  'vtwinmfg.com',
  'images.vtwinmfg.com',
];

/**
 * Returns a safe, publicly-loadable image URL.
 * Any vendor CDN host routes through /api/img to handle:
 *   - Mixed content (http → https)
 *   - ZIP extraction (LeMans)
 *   - Hotlink blocking
 */
export function proxyImageUrl(url: string | null | undefined): string {
  if (!url) return '/images/placeholder.jpg';

  try {
    const parsed = new URL(url);
    const needsProxy = PROXY_DOMAINS.some(d => parsed.hostname.includes(d));
    if (needsProxy) {
      return `/api/img?u=${encodeURIComponent(url)}`;
    }
  } catch {
    return '/images/placeholder.jpg';
  }

  // Own CDN, Supabase Storage, relative URLs — serve directly
  return url;
}

/**
 * Returns the first valid image from an array, proxied if needed.
 */
export function primaryImage(images: string[] | null | undefined): string {
  if (!images || images.length === 0) return '/images/placeholder.jpg';
  return proxyImageUrl(images[0]);
}

/**
 * Map an entire images array through the proxy.
 */
export function proxyAllImages(images: string[] | null | undefined): string[] {
  if (!images || images.length === 0) return ['/images/placeholder.jpg'];
  return images.map(proxyImageUrl);
}

// Legacy export for any code still importing shouldProxy
export function shouldProxy(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return PROXY_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

const LEMANS_ZIP_PREFIX = "http://asset.lemansnet.com/z/";

export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(LEMANS_ZIP_PREFIX)) {
    return `/api/img?u=${encodeURIComponent(url)}`;
  }
  return url;
}

export function proxyImageUrls(urls: string[] | null | undefined): string[] {
  if (!urls?.length) return [];
  return urls.map(u => proxyImageUrl(u)).filter((u): u is string => u !== null);
}

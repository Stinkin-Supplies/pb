export function isRealImage(url: string) {
  if (!url || !url.startsWith("http")) return false

  const lower = url.toLowerCase()

  if (lower.includes(".zip") || lower.includes("download")) return false

  if (lower.includes("lemansnet.com")) return true

  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".svg")
  )
}

export function normalize(url: string) {
  return url
    .replace("http://", "https://")
    .split("?")[0]
}

export function dedupe(urls: string[]) {
  return [...new Set(urls.map(normalize))]
}

export function mergeProductImages({
  wps = [],
  pies = [],
  pu = [],
  score
}: {
  wps?: string[] | null
  pies?: string[] | null
  pu?: string[] | null
  score?: (url: string) => number
}) {
  const safeWps = Array.isArray(wps) ? wps : []
  const safePies = Array.isArray(pies) ? pies : []
  const safePu = Array.isArray(pu) ? pu : []

  const cleanWps  = dedupe(safeWps.filter(isRealImage))
  const cleanPies = dedupe(safePies.filter(isRealImage))
  const cleanPu   = dedupe(safePu.filter(isRealImage))

  // Priority merge
  let merged = [
    ...cleanWps,
    ...cleanPies,
    ...cleanPu
  ]

  // Final dedupe (cross-source)
  merged = dedupe(merged)

  if (score) {
    merged.sort((a, b) => score(b) - score(a))
  }

  // Limit size (important)
  return merged.slice(0, 5)
}

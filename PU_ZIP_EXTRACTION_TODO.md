# PU Image Zip Extraction — To-Do

## Background (confirmed via investigation, June 16 2026)

~13,790 active PU products (out of 36,684 total active PU rows) have no usable
direct product image. Every field that should hold one — `catalog_unified.image_url`,
`pu_catalog.image_url`, `pu_catalog.product_image`, `pu_brand_enrichment.image_uri`
(sourced from PU's own PIES XML feed) — independently resolves to the exact same
LeMans CDN asset, and that asset returns `Content-Type: application/x-zip`, not an
image. This was invisible to status-only dead-link checking (the URLs return a
healthy 200) and only surfaced by checking actual Content-Type headers.

Conclusion: this is not a column-mixup or backfill bug. PU's upstream feed never
shipped a direct image for these products — only a zip archive (likely multi-angle
photography) — and that zip reference propagated into every table that touches it.
The only way to recover real photos is to open the zip and extract an image.

**`catalog_media` fallback caveat:** the existing `COALESCE(image_url, catalog_media.url)`
fallback (added session 50/51) does NOT rescue these products, because
`catalog_media` rows for PU are themselves populated from `pu_brand_enrichment.image_uri`
— the same contaminated source. Don't assume the fallback fixes this category.

## Immediate stopgap (separate, smaller task — do this first regardless)

Before building the extraction pipeline, null out `image_url` /  remove the bad
`catalog_media` rows for confirmed zip-contaminated products so the site shows
the clean "NO IMAGE" placeholder instead of a broken-image icon. This requires a
full (non-sampled) scan of both `image_url` and `catalog_media.url` for all active
products — not just a sample — to build one authoritative list. See prior session
for `check_dead_images.mjs` / `check_brand_enrichment_images.mjs` as starting points
for the scan logic (Content-Type check, not status-only).

## Zip Extraction Project

| # | Task | Notes |
|---|------|-------|
| 0 | **Manually download and inspect one zip** | Before writing any pipeline code: pull one known-bad asset URL by hand, unzip it locally, and look at what's actually inside. Confirms: single image vs. multiple, naming convention, file format (jpg/png/tiff?), whether it's even a valid non-corrupt archive. This determines most decisions below — don't skip it. |
| 1 | **Decide image selection logic** | If a zip contains multiple images (e.g. multi-angle), need a rule for which one becomes the primary `catalog_media` (priority=0) entry — likely "first file alphabetically" or "largest file" or a naming pattern (PU may use a `_1`, `_main`, etc. suffix convention — check during step 0). |
| 2 | **Decide storage destination** | Extracted images need to live somewhere permanent and publicly servable. Options: upload to existing image hosting if any, or a new bucket (S3 / Cloudflare R2 / Vercel Blob). Check what's already in use for any other extracted/processed assets in this project before introducing a new one. |
| 3 | **Build `scripts/ingest/extract_pu_zip_images.mjs`** | Pipeline: query for confirmed zip-contaminated PU products → download zip → extract chosen image(s) → upload to storage destination → insert/update `catalog_media` row(s) with the new real URL and appropriate `priority` → mark `pu_brand_enrichment` or a new tracking column so re-runs don't redo completed work. |
| 4 | **Concurrency + rate limiting** | Same pattern as `check_dead_images.mjs` — concurrency-limited queue, since downloading ~13,790 zips at once would hammer LeMans' CDN. Reuse that pattern. |
| 5 | **Progress tracking / resumability** | This will likely take a while and may fail partway (network errors, corrupt zips, unexpected formats). Needs a way to resume without re-processing already-completed products — e.g. a `pu_zip_extraction_status` tracking table or a status column. |
| 6 | **Handle corrupt / empty / unexpected zips gracefully** | Some zips may be empty, corrupt, or contain non-image files (PDFs, spec sheets). Log these separately for manual review rather than crashing the whole run. |
| 7 | **Verify extracted images before committing** | Run the same Content-Type check against the newly-extracted, newly-hosted URLs before writing them into `catalog_media` — don't repeat the mistake of trusting a URL without checking what it actually serves. |
| 8 | **Re-run Typesense reindex** | New images need to flow through to search results once `catalog_media`/`image_url` are updated. |
| 9 | **Spot-check a sample of fixed products on the live site** | Visual confirmation across a handful of categories/brands before considering this done. |

## Open questions to resolve during Step 0

- Are all ~13,790 zips structurally similar, or are there multiple different zip formats/conventions across different PU sub-brands?
- Is there a meaningful file size pattern that distinguishes "real photo zip" from a possibly-corrupt/placeholder zip?
- Does PU offer a non-zip image feed elsewhere (a different XML export, a different API endpoint) that might sidestep this entirely for some or all of these products? Worth a quick check with PU's documentation/portal before investing in zip-parsing infrastructure, in case there's a cleaner upstream source that was just never wired in.

## Priority / sequencing note

This is a real-photos-recovery project, not a bug fix — the stopgap (null out the
bad links) removes the visible breakage today. This extraction project can be
scheduled independently, sized properly, and done without time pressure once the
stopgap is in place.

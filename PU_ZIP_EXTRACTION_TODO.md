# PU Image Zip Extraction — To-Do

> **STATUS (updated June 17, 2026): Superseded — keep for reference only.**
> A working zip-extraction proxy (`app/api/image-proxy/route.ts`) was found already
> in the codebase, validated, and wired into both the browse grid (`ProductCard.jsx`)
> and PDP (`ProductImage.jsx`). This serves the same outcome as the offline pipeline
> described below — extracting the first image from each LeMans zip — but live,
> on-demand, with no batch job required. Confirmed working on both the live grid and
> PDP, deployed with a 1-year immutable edge cache.
>
> The original ~13,790 figure below was the count of all zip-contaminated products
> before investigation. After the stopgap (null + restore) and the live proxy fix,
> the real remaining gap is **3,573 active PU products with no recoverable image
> anywhere** (no `image_url`, no match in `pu_brand_enrichment`) — these have no
> source photo to extract from regardless of pipeline, live or offline, and stay on
> the NO IMAGE placeholder until PU provides better data.
>
> This doc's offline-pipeline plan (steps 0–9 below) is not currently needed. Keep
> it only as a reference for the "which file is the real photo" selection question
> if the proxy's first-file-in-zip rule ever turns out wrong on a wider sample.

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

## Immediate stopgap (DONE — see status banner above)

~~Before building the extraction pipeline, null out `image_url` / remove the bad~~
~~`catalog_media` rows for confirmed zip-contaminated products so the site shows~~
~~the clean "NO IMAGE" placeholder instead of a broken-image icon.~~ Completed June 16
(31,730 nulled, 31,396 bad `catalog_media` rows deleted) and superseded June 17 —
the live proxy now restores real photos for the vast majority instead of leaving
them on the placeholder. Only the 3,573 genuinely source-less products remain on
NO IMAGE.

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

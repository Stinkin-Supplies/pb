# STINKIN' SUPPLIES
## HANDOFF LOG
**Session: FatBook/OldBook Crossref Import · May 23, 2026 (Twenty-Eighth Pass — Addendum)**

---

## WHERE WE ARE

### What Was Built This Session (Addendum)

#### 1. FatBook Crossref Import ✅
- `scripts/ingest/import_fatbook_crossref.cjs` — new script
- Parses `fatbookcrossref.txt` (3,948 rows): OEM # → DS Part # → FatBook Page
- Adds `fatbook_page INTEGER` column to `catalog_oem_crossref` if missing
- Upserts into `catalog_oem_crossref` on conflict `(sku, oem_number, oem_manufacturer)`
- Uses `DISTINCT ON (sku, oem_number)` to deduplicate before upsert
- Backfills `in_fatbook = true` on `catalog_unified` (normalized + raw SKU passes)
- Result: 3,940 rows upserted, 95.5% match rate (3,204 / 3,354 distinct DS SKUs)

#### 2. OldBook Crossref Import ✅
- `scripts/ingest/import_oldbook_crossref.cjs` — new script
- Parses `oldbookcrossref.txt` (source file: `1779569140000_oldbook_crossref.txt`)
- Adds `oldbook_page INTEGER` column to `catalog_oem_crossref`
- Same upsert/backfill pattern as FatBook
- Result: 2,643 rows upserted, 96.1% match rate (2,214 / 2,303 distinct DS SKUs)

#### 3. OEM Numbers Full Rebuild ✅
- Previous `oem_numbers[]` on `catalog_unified` was incorrect — full wipe and rebuild
- Rebuilt from `catalog_oem_crossref` using `array_agg(DISTINCT oem_number)`
- 33,890 products received fresh OEM arrays
- 14,936 products with stale/incorrect OEM data cleared to NULL
- Net: 33,890 products with verified OEM numbers (down from incorrect 48,824)

---

## GOTCHAS DISCOVERED THIS SESSION

| Issue | Solution |
|-------|----------|
| pg Client with IPv6 URL string | Pass `{ host, user, password, database }` object — never a connection URL string for IPv6 |
| ON CONFLICT duplicate source rows | Use `DISTINCT ON (sku, oem_number)` in INSERT SELECT before conflict target |
| catalog_oem_crossref column is `sku` not `vendor_sku` | Schema uses `sku` — unique constraint is `(sku, oem_number, oem_manufacturer)` |
| oem_numbers[] was populated with wrong data | Full wipe + rebuild from catalog_oem_crossref is canonical source of truth |

---

## DB STATE AFTER THIS SESSION

| Table | Rows | Notes |
|-------|------|-------|
| catalog_oem_crossref | 55,122 | ✅ +fatbook_page (3,940 rows), +oldbook_page (2,643 rows) |
| catalog_unified | 96,711 | ✅ oem_numbers[] rebuilt — 33,890 products have OEM arrays |
| catalog_unified in_fatbook | 32,577 | ✅ |
| catalog_unified in_oldbook | 17,049 | ✅ |

---

## WHAT NEEDS TO HAPPEN NEXT

### 1. Verify VTwin Images Load (HIGH)
Deploy `app/api/img/route.ts` fix and confirm VTwin product images appear on PDP.
Test: `localhost:3000/browse/1000cc-piston-ring-set-050-oversize-msc689413-v`

### 2. Wire OEM Numbers to Frontend (MEDIUM)
`catalog_unified.oem_numbers[]` is now populated and correct — display on PDP.

### 3. Verify Filter Bottom Sheet Mobile (MEDIUM)
subcategory + modelCodes params flowing end-to-end through API on mobile.

### 4. Fulfillment Routing (FUTURE)
`cross_vendor_products` table + `resolve_cart_fulfillment()` + cart integration.

### 5. Cart Wiring (FUTURE)
`CartContext / addItem` is placeholder only.

---

## KEY FILES CHANGED THIS SESSION (ADDENDUM)

| File | Location | Change |
|------|----------|--------|
| import_fatbook_crossref.cjs | scripts/ingest/ | New — FatBook OEM crossref import |
| import_oldbook_crossref.cjs | scripts/ingest/ | New — OldBook OEM crossref import |

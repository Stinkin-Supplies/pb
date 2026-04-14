# Typesense OEM Cross-Reference - Quick Start

## 🚀 One-Command Setup

```bash
# Install all scripts and run complete setup
npm install && npm run setup:all
```

That's it! This will:
1. Create the OEM table in Postgres
2. Import sample OEM cross-reference data
3. Recreate Typesense schema with OEM fields
4. Index all products with OEM data

---

## 📦 What You Get

### OEM Cross-Reference Search
```
User searches: "14-1977"
→ Finds: DS Oil Filter SKU 1975
→ Shows: "Replaces HD 14-1977, 63790-77, 63805-80"
```

### Fitment Cascade Filtering
```
1. Select Make: "Harley-Davidson"
2. Select Model: "Softail"  
3. Select Year: "2015"
→ Shows only parts that fit 2015 HD Softail
```

### Multi-Vendor Support
```
Same product from:
- Parts Unlimited (PU): SKU 1975
- WPS: SKU 560-1006
- Manufacturer: DS-275553
```

---

## 📋 Step-by-Step (Manual)

If you prefer to run steps individually:

### Step 1: Create Database Table
```bash
npm run setup:db
```

### Step 2: Import OEM Data
```bash
npm run import:oem
```

### Step 3: Recreate Typesense Schema
```bash
npm run typesense:recreate
```

### Step 4: Index Products
```bash
# Test with 100 products first
npm run typesense:index-test

# Then run full indexing
npm run typesense:index
```

### Step 5: Verify Everything Works
```bash
npm run verify
```

---

## 🔧 Required Environment Variables

Add these to your `.env.local`:

```bash
# Postgres Database
CATALOG_DATABASE_URL=postgres://user:pass@host:5432/database

# Typesense
TYPESENSE_HOST=jt2krfeha58ibq61p-1.a2.typesense.net
TYPESENSE_API_KEY=your_admin_key_here
```

---

## 📁 Files Included

| File | Purpose |
|------|---------|
| `migration_add_oem_table.sql` | Creates catalog_oem_crossref table |
| `import-oem-crossref.js` | Imports OEM data to database |
| `recreate-schema.js` | Updates Typesense schema |
| `index_assembly_optimized.js` | Indexes products with OEM data |
| `verify-setup.js` | Tests everything works |
| `typesense_schema_complete.json` | Full Typesense schema |
| `sample_products_typesense.json` | Example indexed documents |
| `IMPLEMENTATION_GUIDE.md` | Detailed guide (7-10 hours) |
| `TYPESENSE_FORMAT_DOCUMENTATION.md` | Complete API reference |

---

## 🎯 Search Examples

### Basic Text Search
```javascript
fetch('/api/search?q=oil+filter&query_by=name,brand,description')
```

### OEM Lookup
```javascript
fetch('/api/search?q=14-1977&query_by=oem_numbers,sku')
```

### Fitment Filter
```javascript
fetch('/api/search?q=brake+pads&filter_by=fitment_make:=Harley-Davidson&&fitment_year:=2015')
```

### Combined Search
```javascript
fetch('/api/search?q=oil+filter&filter_by=fitment_make:=Harley-Davidson&&in_stock:=true&sort_by=computed_price:asc')
```

---

## 🐛 Troubleshooting

### "Table does not exist"
```bash
npm run setup:db
```

### "Collection not found"
```bash
npm run typesense:recreate
```

### "No OEM data found"
```bash
npm run import:oem
```

### "Search returns no results"
```bash
npm run typesense:index
```

### Test Everything
```bash
npm run verify
```

---

## 📞 Support

If you run into issues:

1. Run `npm run verify` to see what's wrong
2. Check `.env.local` has correct credentials
3. Check `IMPLEMENTATION_GUIDE.md` for detailed steps
4. Check `TYPESENSE_FORMAT_DOCUMENTATION.md` for API details

---

## ⏱️ Time Estimates

| Task | Duration |
|------|----------|
| Setup (one-time) | 2-3 hours |
| Full indexing | 1-2 hours |
| Frontend integration | 2-3 hours |
| **TOTAL** | **5-8 hours** |

---

## ✅ Success Criteria

After setup, you should be able to:

- ✅ Search by OEM part number (e.g., "14-1977")
- ✅ Filter by Make → Model → Year
- ✅ See OEM cross-references on product pages
- ✅ Search across 169K products in < 50ms
- ✅ Filter by brand, category, specs, stock status

---

## 🔄 Scheduled Maintenance

Add to crontab for nightly reindexing:

```bash
# Reindex every night at 2 AM
0 2 * * * cd /var/www/your-app && npm run typesense:index >> logs/reindex.log 2>&1
```

---

## 📈 Next Steps

After successful implementation:

1. **Expand OEM Data**: Add Honda, Yamaha, Kawasaki cross-references
2. **Add Analytics**: Track which OEM numbers are searched most
3. **Configure Synonyms**: Add common abbreviations (HD, H-D, etc.)
4. **Optimize Images**: Lazy load product images
5. **Add Reviews**: Integrate product reviews with fitment

---

## 🎉 You're Ready!

Run `npm run setup:all` and you'll have OEM cross-reference search working in your motorcycle parts catalog.

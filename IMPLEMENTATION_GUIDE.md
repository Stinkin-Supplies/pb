# Typesense Implementation Guide - Step by Step

## Prerequisites Checklist

- [x] Typesense cluster running: `jt2krfeha58ibq61p-1.a2.typesense.net`
- [x] Hetzner Postgres database with catalog tables
- [x] Node.js environment with npm/npx
- [x] Environment variables configured in `.env.local`

---

## PHASE 1: Database Preparation (1-2 hours)

### Step 1.1: Add OEM Cross-Reference Table

Create a new table to store OEM mappings:

```sql
-- Connect to your Hetzner Postgres database
-- Run this SQL:

CREATE TABLE IF NOT EXISTS catalog_oem_crossref (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,                    -- Your DS/PU part number
  oem_number TEXT NOT NULL,              -- OEM part number (e.g., "14-1977")
  oem_manufacturer TEXT NOT NULL,        -- "Harley-Davidson", "Honda", etc.
  page_reference TEXT,                   -- Page in catalog
  source_file TEXT,                      -- "FatBook_2026-ref.pdf"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for fast lookup
  CONSTRAINT unique_oem_ref UNIQUE (sku, oem_number, oem_manufacturer)
);

CREATE INDEX idx_oem_sku ON catalog_oem_crossref(sku);
CREATE INDEX idx_oem_number ON catalog_oem_crossref(oem_number);
CREATE INDEX idx_oem_manufacturer ON catalog_oem_crossref(oem_manufacturer);
```

### Step 1.2: Import OEM Cross-Reference Data

Create import script:

```bash
# Create file: scripts/ingest/import-oem-crossref.js

const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function importOEMData() {
  console.log('📥 Importing OEM cross-reference data...\n');

  // Load the OEM data (you'll need to extract this from the PDF)
  const oemData = {
    '1975': [
      { oem_number: '14-1977', manufacturer: 'Harley-Davidson', page: '511' },
      { oem_number: '63790-77', manufacturer: 'Harley-Davidson', page: '511' }
    ],
    'DS-193711': [
      { oem_number: '1975704', manufacturer: 'Harley-Davidson', page: '2013' }
    ],
    // ... more mappings
  };

  let inserted = 0;
  let skipped = 0;

  for (const [sku, refs] of Object.entries(oemData)) {
    for (const ref of refs) {
      try {
        await pool.query(`
          INSERT INTO catalog_oem_crossref 
            (sku, oem_number, oem_manufacturer, page_reference, source_file)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (sku, oem_number, oem_manufacturer) DO NOTHING
        `, [
          sku,
          ref.oem_number,
          ref.manufacturer,
          ref.page,
          'FatBook_2026-ref.pdf'
        ]);
        inserted++;
      } catch (err) {
        console.error(`Failed to insert ${sku} -> ${ref.oem_number}:`, err.message);
        skipped++;
      }
    }
  }

  console.log(`✓ Imported ${inserted} OEM cross-references`);
  console.log(`✓ Skipped ${skipped} duplicates\n`);

  await pool.end();
}

importOEMData().catch(console.error);
```

Run it:
```bash
npx dotenv -e .env.local -- node scripts/ingest/import-oem-crossref.js
```

---

## PHASE 2: Update Typesense Schema (30 minutes)

### Step 2.1: Backup Current Collection

```bash
# Create backup script: scripts/typesense/backup-collection.js

const Typesense = require('typesense');
const fs = require('fs');

const client = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST,
    port: '443',
    protocol: 'https'
  }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 10
});

async function backupCollection() {
  console.log('💾 Backing up current products collection...\n');

  try {
    // Export all documents
    const docs = await client.collections('products')
      .documents()
      .export();

    fs.writeFileSync(
      'backups/products_backup_' + Date.now() + '.jsonl',
      docs
    );

    console.log('✓ Backup complete\n');
  } catch (err) {
    console.error('Backup failed:', err);
  }
}

backupCollection();
```

Run it:
```bash
mkdir -p backups
npx dotenv -e .env.local -- node scripts/typesense/backup-collection.js
```

### Step 2.2: Update Schema with New Fields

You have two options:

#### Option A: Drop and Recreate (RECOMMENDED - Clean Start)

```bash
# Create file: scripts/typesense/recreate-schema.js

const Typesense = require('typesense');
const fs = require('fs');

const client = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST,
    port: '443',
    protocol: 'https'
  }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 10
});

async function recreateSchema() {
  console.log('🔄 Recreating Typesense schema...\n');

  try {
    // Step 1: Delete old collection
    console.log('Deleting old collection...');
    await client.collections('products').delete();
    console.log('✓ Deleted\n');

    // Step 2: Create new collection with updated schema
    console.log('Creating new collection...');
    const schema = JSON.parse(
      fs.readFileSync('./typesense_schema_complete.json', 'utf8')
    );
    
    await client.collections().create(schema);
    console.log('✓ Created with new schema\n');

    console.log('✅ Schema recreation complete!');
    console.log('➡️  Next: Run index_assembly_optimized.js to populate\n');

  } catch (err) {
    console.error('Schema recreation failed:', err);
  }
}

recreateSchema();
```

Run it:
```bash
npx dotenv -e .env.local -- node scripts/typesense/recreate-schema.js
```

#### Option B: Create New Collection (Zero Downtime)

```bash
# Create products_v3 with new schema, then alias swap
const schema = JSON.parse(fs.readFileSync('./typesense_schema_complete.json'));
schema.name = 'products_v3';  // New collection name

await client.collections().create(schema);

# After indexing products_v3:
# Point 'products' alias to products_v3
# Delete old collection
```

---

## PHASE 3: Update Index Assembly Script (1 hour)

### Step 3.1: Install the Optimized Script

```bash
# Copy the provided script to your project
cp index_assembly_optimized.js scripts/ingest/

# Install dependencies if needed
npm install typesense pg
```

### Step 3.2: Modify for Your Database

Edit `scripts/ingest/index_assembly_optimized.js`:

```javascript
// Add after line 15 (after Pool initialization):

// Step 1: Load OEM cross-references from database instead of JSON file
async function loadOEMCrossrefs() {
  console.log('📚 Loading OEM cross-references from database...');
  
  const { rows } = await pool.query(`
    SELECT 
      sku,
      oem_number,
      oem_manufacturer,
      page_reference
    FROM catalog_oem_crossref
  `);

  // Build lookup map: sku -> array of OEM refs
  const oemMap = {};
  
  rows.forEach(row => {
    if (!oemMap[row.sku]) {
      oemMap[row.sku] = [];
    }
    
    oemMap[row.sku].push({
      oem_number: row.oem_number,
      manufacturer: row.oem_manufacturer,
      page_reference: row.page_reference
    });
  });

  console.log(`✓ Loaded ${rows.length} OEM cross-references for ${Object.keys(oemMap).length} products\n`);
  
  return oemMap;
}

// Update the indexProducts function to use it:
async function indexProducts() {
  console.log('🚀 Starting Typesense indexing...\n');

  try {
    // Load OEM data first
    const oemCrossrefs = await loadOEMCrossrefs();

    // ... rest of your existing code ...

    // When building documents, use oemCrossrefs instead of OEM_CROSSREF:
    for (const product of products) {
      // ...
      const oemRefs = oemCrossrefs[product.sku] || [];
      
      const doc = buildDocument(
        product,
        productSpecs,
        productMedia,
        productFitment,
        productOffers,
        oemRefs  // Pass OEM refs from database
      );
      // ...
    }
  }
}
```

### Step 3.3: Test with Small Batch First

```javascript
// Modify the product query to test with 100 products first:
const productQuery = `
  SELECT ...
  FROM catalog_products cp
  WHERE ...
  ORDER BY cp.id
  LIMIT 100  -- TEST MODE
`;
```

---

## PHASE 4: Run the Indexer (1-2 hours for full catalog)

### Step 4.1: Test Run

```bash
# Run with test limit (100 products)
npx dotenv -e .env.local -- node scripts/ingest/index_assembly_optimized.js
```

Expected output:
```
🚀 Starting Typesense indexing...

📚 Loading OEM cross-references from database...
✓ Loaded 3,500 OEM cross-references for 2,800 products

📦 Fetching products from catalog_products...
✓ Found 100 products to index

📊 Fetching specs...
✓ Found 450 spec entries
🖼️  Fetching media...
✓ Found 320 media entries
🚗 Fetching fitment...
✓ Found 1,200 fitment entries
💰 Fetching vendor offers...
✓ Found 180 vendor offers

🔨 Building Typesense documents...
✓ Built 100 documents

📤 Importing to Typesense...
  Batch 1: 100 docs

✅ INDEXING COMPLETE
   Imported: 100
   Failed: 0
   Total: 100
```

### Step 4.2: Full Production Run

Remove the `LIMIT 100` and run full indexing:

```bash
# Edit scripts/ingest/index_assembly_optimized.js
# Remove the LIMIT clause

# Run full indexing
npx dotenv -e .env.local -- node scripts/ingest/index_assembly_optimized.js
```

This will take 1-2 hours for ~170K products.

---

## PHASE 5: Update Frontend Search (2-3 hours)

### Step 5.1: Update Search Route

Edit your API search route (e.g., `app/api/search/route.ts`):

```typescript
// app/api/search/route.ts

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '*';
  const filters = searchParams.get('filter_by') || '';
  const facets = searchParams.get('facet_by') || '';

  const searchParameters = {
    q: query,
    query_by: 'name,brand,sku,oem_numbers,description,search_blob',
    query_by_weights: '10,5,8,7,2,1',  // OEM numbers weighted high
    filter_by: filters,
    facet_by: facets || 'brand,category,fitment_make,fitment_model,in_stock',
    sort_by: searchParams.get('sort_by') || 'computed_price:asc',
    per_page: parseInt(searchParams.get('per_page') || '50'),
    page: parseInt(searchParams.get('page') || '1'),
  };

  try {
    const results = await typesenseClient
      .collections('products')
      .documents()
      .search(searchParameters);

    return Response.json(results);
  } catch (error) {
    console.error('Search error:', error);
    return Response.json({ error: 'Search failed' }, { status: 500 });
  }
}
```

### Step 5.2: Add OEM Search Component

```tsx
// components/shop/OEMSearch.tsx

'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

export function OEMSearch() {
  const [oemNumber, setOemNumber] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchOEM = async () => {
    if (!oemNumber.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(oemNumber)}&query_by=oem_numbers,sku`
      );
      const data = await res.json();
      setResults(data.hits || []);
    } catch (err) {
      console.error('OEM search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="oem-search">
      <div className="search-box">
        <input
          type="text"
          placeholder="Enter OEM Part # (e.g., 14-1977)"
          value={oemNumber}
          onChange={(e) => setOemNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchOEM()}
          className="oem-input"
        />
        <button onClick={searchOEM} disabled={loading}>
          <Search size={20} />
          {loading ? 'Searching...' : 'Find Replacement'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="results">
          <h3>Cross-Reference Results</h3>
          {results.map((hit) => (
            <div key={hit.document.id} className="result-card">
              <img src={hit.document.primary_image} alt={hit.document.name} />
              <div>
                <h4>{hit.document.name}</h4>
                <p>SKU: {hit.document.sku}</p>
                <p>Replaces: {hit.document.oem_numbers?.join(', ')}</p>
                <p className="price">${hit.document.computed_price}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Step 5.3: Add Fitment Cascade Filter

```tsx
// components/shop/FitmentFilter.tsx

'use client';

import { useState, useEffect } from 'react';

export function FitmentFilter({ onFilterChange }) {
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  
  const [selectedMake, setSelectedMake] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  // Fetch makes on mount
  useEffect(() => {
    fetch('/api/search?q=*&facet_by=fitment_make')
      .then(r => r.json())
      .then(data => {
        const makeFacets = data.facet_counts?.find(f => f.field_name === 'fitment_make');
        setMakes(makeFacets?.counts || []);
      });
  }, []);

  // Fetch models when make changes
  useEffect(() => {
    if (!selectedMake) {
      setModels([]);
      setSelectedModel('');
      return;
    }

    fetch(`/api/search?q=*&filter_by=fitment_make:=${selectedMake}&facet_by=fitment_model`)
      .then(r => r.json())
      .then(data => {
        const modelFacets = data.facet_counts?.find(f => f.field_name === 'fitment_model');
        setModels(modelFacets?.counts || []);
      });
  }, [selectedMake]);

  // Fetch years when model changes
  useEffect(() => {
    if (!selectedMake || !selectedModel) {
      setYears([]);
      setSelectedYear('');
      return;
    }

    fetch(
      `/api/search?q=*&filter_by=fitment_make:=${selectedMake}&&fitment_model:=${selectedModel}&facet_by=fitment_year`
    )
      .then(r => r.json())
      .then(data => {
        const yearFacets = data.facet_counts?.find(f => f.field_name === 'fitment_year');
        setYears(yearFacets?.counts || []);
      });
  }, [selectedMake, selectedModel]);

  // Notify parent of filter changes
  useEffect(() => {
    const filters = [];
    if (selectedMake) filters.push(`fitment_make:=${selectedMake}`);
    if (selectedModel) filters.push(`fitment_model:=${selectedModel}`);
    if (selectedYear) filters.push(`fitment_year:=${selectedYear}`);
    
    onFilterChange(filters.join(' && '));
  }, [selectedMake, selectedModel, selectedYear, onFilterChange]);

  return (
    <div className="fitment-filter">
      <h3>Shop by Vehicle</h3>
      
      <select 
        value={selectedMake} 
        onChange={(e) => setSelectedMake(e.target.value)}
      >
        <option value="">Select Make</option>
        {makes.map(m => (
          <option key={m.value} value={m.value}>
            {m.value} ({m.count})
          </option>
        ))}
      </select>

      {selectedMake && (
        <select 
          value={selectedModel} 
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          <option value="">Select Model</option>
          {models.map(m => (
            <option key={m.value} value={m.value}>
              {m.value} ({m.count})
            </option>
          ))}
        </select>
      )}

      {selectedModel && (
        <select 
          value={selectedYear} 
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          <option value="">Select Year</option>
          {years.map(y => (
            <option key={y.value} value={y.value}>
              {y.value} ({y.count})
            </option>
          ))}
        </select>
      )}

      {(selectedMake || selectedModel || selectedYear) && (
        <button 
          onClick={() => {
            setSelectedMake('');
            setSelectedModel('');
            setSelectedYear('');
          }}
          className="clear-filters"
        >
          Clear Fitment
        </button>
      )}
    </div>
  );
}
```

### Step 5.4: Update Shop Page

```tsx
// app/shop/page.tsx

'use client';

import { useState } from 'react';
import { OEMSearch } from '@/components/shop/OEMSearch';
import { FitmentFilter } from '@/components/shop/FitmentFilter';
import { ProductGrid } from '@/components/shop/ProductGrid';

export default function ShopPage() {
  const [filters, setFilters] = useState('');
  const [searchQuery, setSearchQuery] = useState('*');

  return (
    <div className="shop-page">
      <aside className="sidebar">
        <OEMSearch />
        <FitmentFilter onFilterChange={setFilters} />
        {/* Other filters (brand, category, etc.) */}
      </aside>

      <main className="product-area">
        <ProductGrid 
          query={searchQuery}
          filters={filters}
        />
      </main>
    </div>
  );
}
```

---

## PHASE 6: Testing & Validation (1 hour)

### Test Checklist

#### 6.1 OEM Search Test
```bash
# Test via API directly:
curl "https://your-site.com/api/search?q=14-1977&query_by=oem_numbers,sku"

# Expected: Returns SKU "1975" (oil filter)
```

#### 6.2 Fitment Cascade Test
1. Open shop page
2. Select "Harley-Davidson" from Make dropdown
3. Verify Model dropdown populates with HD models
4. Select "Softail" 
5. Verify Year dropdown shows 1984-2017
6. Select 2015
7. Verify product grid filters correctly

#### 6.3 Multi-Filter Test
```bash
# Test combined filters:
curl "https://your-site.com/api/search?q=oil+filter&filter_by=fitment_make:=Harley-Davidson&&fitment_year:=2015&&in_stock:=true"

# Expected: Returns in-stock oil filters that fit 2015 HD bikes
```

#### 6.4 Performance Test
```bash
# Check index size and search speed:
curl "https://jt2krfeha58ibq61p-1.a2.typesense.net/collections/products" \
  -H "X-TYPESENSE-API-KEY: your-api-key"

# Expected response time: < 50ms
# Expected num_documents: ~169,000
```

---

## PHASE 7: Production Deployment

### 7.1 Environment Variables

Ensure these are set in production:

```bash
# .env.production
TYPESENSE_HOST=jt2krfeha58ibq61p-1.a2.typesense.net
TYPESENSE_API_KEY=your_admin_key
CATALOG_DATABASE_URL=postgres://...
NEXT_PUBLIC_TYPESENSE_SEARCH_API_KEY=your_search_only_key
```

### 7.2 Scheduled Reindexing

Set up cron job for nightly reindexing:

```bash
# crontab -e
0 2 * * * cd /var/www/your-app && npx dotenv -e .env.production -- node scripts/ingest/index_assembly_optimized.js >> logs/typesense-reindex.log 2>&1
```

### 7.3 Monitoring

Add logging to track:
- Search query performance
- Failed OEM lookups
- Fitment filter usage
- Popular search terms

---

## Troubleshooting

### Issue: "Collection not found"
```bash
# Verify collection exists:
curl "https://your-typesense-host/collections/products" \
  -H "X-TYPESENSE-API-KEY: your-key"
```

### Issue: "OEM search returns no results"
```bash
# Check if OEM data was imported:
SELECT COUNT(*) FROM catalog_oem_crossref;

# Check if documents have OEM numbers:
curl "https://your-typesense-host/collections/products/documents/search?q=*&filter_by=oem_numbers:!= ''" \
  -H "X-TYPESENSE-API-KEY: your-key"
```

### Issue: "Fitment cascade not working"
```bash
# Verify fitment facets exist:
curl "https://your-typesense-host/collections/products/documents/search?q=*&facet_by=fitment_make" \
  -H "X-TYPESENSE-API-KEY: your-key"
```

---

## Next Steps

After successful implementation:

1. **Add Analytics**: Track which OEM numbers are searched most
2. **Expand OEM Data**: Add Honda, Yamaha, Kawasaki cross-references
3. **Add Synonyms**: Configure Typesense synonyms for common terms
4. **Optimize Images**: Lazy load product images in results
5. **Add Inventory Alerts**: "Notify me when in stock" for OOS items

---

## Summary Timeline

| Phase | Duration | Task |
|-------|----------|------|
| 1 | 1-2 hours | Database preparation (OEM table + import) |
| 2 | 30 min | Update Typesense schema |
| 3 | 1 hour | Update index assembly script |
| 4 | 1-2 hours | Run full indexing |
| 5 | 2-3 hours | Update frontend components |
| 6 | 1 hour | Testing & validation |
| 7 | 30 min | Production deployment |
| **TOTAL** | **7-10 hours** | **Full implementation** |

You now have everything needed to implement OEM cross-reference search and fitment filtering in your motorcycle parts catalog!

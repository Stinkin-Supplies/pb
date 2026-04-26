# Typesense Product Index - Optimized Format

## Overview

This document describes the optimized JSON format for indexing motorcycle parts in Typesense with support for:
- **OEM cross-references** (Harley-Davidson → Drag Specialties mapping)
- **Vehicle fitment** (Make/Model/Year filtering)
- **Multi-vendor support** (WPS + Parts Unlimited)
- **Faceted search** (Brand, Category, Specs, In Stock)

---

## Schema Design Principles

### 1. **Array Fields for Multi-Value Data**
Parts often fit multiple vehicles and have multiple OEM equivalents. Using arrays enables:
- Single product → multiple fitment applications
- Single product → multiple OEM numbers
- Efficient faceted filtering in Typesense

### 2. **Separate Search vs. Display Fields**
- `oem_numbers: string[]` - **Indexed** for fast search/lookup
- `vendor_codes: object` - **Not indexed**, stored for display only
- `warehouse_availability: object[]` - **Not indexed**, structured data for UI

### 3. **Facets for Filtering**
Fields marked `facet: true` enable sidebar filters:
- `fitment_make` → "Harley-Davidson", "Honda", etc.
- `fitment_model` → "Softail", "Sportster", etc.
- `fitment_year` → 2015, 2016, 2017, etc.
- `brand` → "Drag Specialties", "Pro-Wheel", etc.
- `catalogs` → "fatbook", "oldbook", "tire", etc.

### 4. **Specs as Facets**
Instead of separate fields, specs use a single faceted array:
```json
"specs_facets": [
  "Type:Spin-On",
  "Height:3.5in",
  "Thread:3/4-16",
  "Finish:Chrome"
]
```

This allows dynamic filtering without schema changes:
```
?filter_by=specs_facets:=Type:Spin-On
```

---

## Field Reference

### Core Product Fields

| Field | Type | Indexed | Faceted | Description |
|-------|------|---------|---------|-------------|
| `id` | string | ✓ | ✗ | Unique product ID |
| `sku` | string | ✓ | ✗ | Vendor SKU (primary lookup) |
| `slug` | string | ✓ | ✗ | URL-friendly identifier |
| `name` | string | ✓ | ✗ | Product name (weighted search) |
| `brand` | string | ✓ | ✓ | Brand name (faceted filter) |
| `category` | string | ✓ | ✓ | Product category |
| `description` | string | ✓ | ✗ | Long description (searchable) |

### Pricing & Inventory

| Field | Type | Indexed | Faceted | Sortable | Description |
|-------|------|---------|---------|----------|-------------|
| `computed_price` | float | ✓ | ✗ | ✓ | Your selling price |
| `map_price` | float | ✓ | ✗ | ✓ | Minimum advertised price |
| `msrp` | float | ✓ | ✗ | ✗ | Manufacturer suggested retail |
| `in_stock` | bool | ✓ | ✓ | ✗ | Stock status (faceted) |
| `total_qty` | int32 | ✓ | ✗ | ✗ | Total quantity across warehouses |

### OEM Cross-References

| Field | Type | Indexed | Faceted | Description |
|-------|------|---------|---------|-------------|
| `oem_numbers` | string[] | ✓ | ✗ | OEM part numbers (searchable) |
| `oem_manufacturers` | string[] | ✓ | ✓ | OEM manufacturers (faceted) |

**Example:**
```json
{
  "sku": "1975",
  "oem_numbers": ["14-1977", "63790-77", "63805-80"],
  "oem_manufacturers": ["Harley-Davidson"]
}
```

**Search by OEM:**
```
?q=14-1977&query_by=oem_numbers,sku,name
```

### Vehicle Fitment

| Field | Type | Indexed | Faceted | Description |
|-------|------|---------|---------|-------------|
| `fitment_make` | string[] | ✓ | ✓ | Vehicle makes (e.g., "Harley-Davidson") |
| `fitment_model` | string[] | ✓ | ✓ | Vehicle models (e.g., "Softail", "Dyna") |
| `fitment_year` | int32[] | ✓ | ✓ | Model years (e.g., 2015, 2016, 2017) |
| `fitment_applications` | string[] | ✓ | ✗ | Human-readable fitment (searchable) |

**Example:**
```json
{
  "fitment_make": ["Harley-Davidson"],
  "fitment_model": ["Softail", "Dyna", "Touring"],
  "fitment_year": [2000, 2001, 2002, ..., 2017],
  "fitment_applications": [
    "2000-2017 Harley-Davidson Softail",
    "2006-2017 Harley-Davidson Dyna",
    "2000-2017 Harley-Davidson Touring"
  ]
}
```

**Cascade Filtering:**
```
# Step 1: User selects Make
?facet_by=fitment_make

# Step 2: User selects Model (filtered by Make)
?filter_by=fitment_make:=Harley-Davidson&facet_by=fitment_model

# Step 3: User selects Year (filtered by Make + Model)
?filter_by=fitment_make:=Harley-Davidson && fitment_model:=Softail&facet_by=fitment_year
```

### Product Specifications

| Field | Type | Indexed | Faceted | Description |
|-------|------|---------|---------|-------------|
| `specs_facets` | string[] | ✓ | ✓ | Specs in "Attribute:Value" format |

**Example:**
```json
{
  "specs_facets": [
    "Type:Spin-On",
    "Height:3.5in",
    "Thread:3/4-16",
    "Finish:Chrome",
    "Micron:10"
  ]
}
```

**Dynamic Filtering:**
```
# Filter by spec
?filter_by=specs_facets:=Finish:Chrome

# Multiple spec filters
?filter_by=specs_facets:=Type:Spin-On && specs_facets:=Finish:Chrome
```

### Media

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `images` | string[] | ✗ | Array of image URLs (priority sorted) |
| `primary_image` | string | ✗ | First/main image (for thumbnails) |

### Catalog Metadata

| Field | Type | Indexed | Faceted | Description |
|-------|------|---------|---------|-------------|
| `catalogs` | string[] | ✓ | ✓ | Source catalogs (e.g., "fatbook", "oldbook") |
| `product_code` | string | ✓ | ✓ | PU product code (A=Motorcycles, E=Drag, etc.) |

### Vendor Data (Not Indexed)

| Field | Type | Description |
|-------|------|-------------|
| `vendor_codes` | object | Vendor SKUs: `{"wps": "560-1006", "pu": "1975"}` |
| `warehouse_availability` | object[] | Per-warehouse stock: `[{"code": "CA", "qty": 250}]` |

### Search Optimization

| Field | Type | Indexed | Description |
|-------|------|---------|-------------|
| `search_blob` | string | ✓ | Concatenated keywords for broad matching |

### Status Flags

| Field | Type | Indexed | Faceted | Description |
|-------|------|---------|---------|-------------|
| `is_discontinued` | bool | ✓ | ✓ | Discontinued flag |
| `is_active` | bool | ✓ | ✓ | Active/visible flag |
| `created_at` | int64 | ✓ | ✗ | Unix timestamp (sortable) |
| `updated_at` | int64 | ✓ | ✗ | Unix timestamp (sortable) |

---

## Search Query Examples

### 1. Basic Text Search
```
GET /collections/products/documents/search
?q=oil filter chrome
&query_by=name,brand,description,search_blob
&query_by_weights=10,5,2,1
```

### 2. OEM Cross-Reference Lookup
```
GET /collections/products/documents/search
?q=14-1977
&query_by=oem_numbers,sku,name
&query_by_weights=10,8,5
```

### 3. Fitment Filtering (Cascade)
```
# Get all makes
?q=*&facet_by=fitment_make

# Filter by make, get models
?q=*
&filter_by=fitment_make:=Harley-Davidson
&facet_by=fitment_model

# Filter by make+model, get years
?q=*
&filter_by=fitment_make:=Harley-Davidson && fitment_model:=Softail
&facet_by=fitment_year

# Final filter: make+model+year
?q=oil filter
&query_by=name,description
&filter_by=fitment_make:=Harley-Davidson && fitment_model:=Softail && fitment_year:=2015
```

### 4. Multi-Facet Filtering
```
GET /collections/products/documents/search
?q=brake pads
&query_by=name,description,category
&filter_by=brand:=Drag Specialties && in_stock:=true && catalogs:=fatbook
&facet_by=brand,category,specs_facets,fitment_make
&sort_by=computed_price:asc
```

### 5. Spec-Based Filtering
```
GET /collections/products/documents/search
?q=oil filter
&query_by=name,category
&filter_by=specs_facets:=Type:Spin-On && specs_facets:=Finish:Chrome
&facet_by=specs_facets
```

### 6. In-Stock Only, Sorted by Price
```
GET /collections/products/documents/search
?q=*
&filter_by=in_stock:=true && is_discontinued:=false
&sort_by=computed_price:asc
&per_page=50
```

### 7. Catalog-Specific Search
```
# FatBook only
?q=*&filter_by=catalogs:=fatbook

# Multiple catalogs
?q=*&filter_by=catalogs:=[fatbook,oldbook]
```

---

## Frontend Integration

### Cascade Filter Component (React)

```jsx
function FitmentFilter({ onFilterChange }) {
  const [selectedMake, setSelectedMake] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);

  // Step 1: Fetch makes
  const { data: makes } = useQuery(['makes'], () =>
    fetch('/api/search?q=*&facet_by=fitment_make').then(r => r.json())
  );

  // Step 2: Fetch models (filtered by make)
  const { data: models } = useQuery(
    ['models', selectedMake],
    () => fetch(
      `/api/search?q=*&filter_by=fitment_make:=${selectedMake}&facet_by=fitment_model`
    ).then(r => r.json()),
    { enabled: !!selectedMake }
  );

  // Step 3: Fetch years (filtered by make+model)
  const { data: years } = useQuery(
    ['years', selectedMake, selectedModel],
    () => fetch(
      `/api/search?q=*&filter_by=fitment_make:=${selectedMake}&&fitment_model:=${selectedModel}&facet_by=fitment_year`
    ).then(r => r.json()),
    { enabled: !!selectedMake && !!selectedModel }
  );

  useEffect(() => {
    const filters = [];
    if (selectedMake) filters.push(`fitment_make:=${selectedMake}`);
    if (selectedModel) filters.push(`fitment_model:=${selectedModel}`);
    if (selectedYear) filters.push(`fitment_year:=${selectedYear}`);
    
    onFilterChange(filters.join(' && '));
  }, [selectedMake, selectedModel, selectedYear]);

  return (
    <div className="fitment-filter">
      <Select value={selectedMake} onChange={setSelectedMake}>
        <option>Select Make</option>
        {makes?.facet_counts?.[0]?.counts.map(m => (
          <option key={m.value} value={m.value}>
            {m.value} ({m.count})
          </option>
        ))}
      </Select>

      {selectedMake && (
        <Select value={selectedModel} onChange={setSelectedModel}>
          <option>Select Model</option>
          {models?.facet_counts?.[0]?.counts.map(m => (
            <option key={m.value} value={m.value}>
              {m.value} ({m.count})
            </option>
          ))}
        </Select>
      )}

      {selectedModel && (
        <Select value={selectedYear} onChange={setSelectedYear}>
          <option>Select Year</option>
          {years?.facet_counts?.[0]?.counts.map(y => (
            <option key={y.value} value={y.value}>
              {y.value} ({y.count})
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
```

---

## Performance Optimization

### Weighted Search
```javascript
const searchParams = {
  q: userQuery,
  query_by: 'name,brand,sku,oem_numbers,specs_facets,search_blob',
  query_by_weights: '10,5,8,7,2,1',
  // ↑ OEM numbers weighted higher than general search
};
```

### Pagination
```javascript
const searchParams = {
  q: userQuery,
  per_page: 50,
  page: currentPage,
};
```

### Caching Strategy
- Cache facet counts for 5 minutes
- Cache product details for 1 hour
- Invalidate on inventory updates

---

## Migration from Current Schema

Your current schema already has:
- ✓ `fitment_make`, `fitment_model`, `fitment_year` arrays
- ✓ `specs` facets
- ✓ Weighted search configured

**New additions needed:**
1. Add `oem_numbers: string[]` field
2. Add `oem_manufacturers: string[]` field  
3. Populate from OEM cross-reference data
4. Update `search_blob` to include OEM numbers

**Migration script:**
```javascript
// Add to index_unified.js
const oemRefs = OEM_CROSSREF.ds_to_oem[product.sku] || [];
const oemNumbers = oemRefs.map(r => r.oem_number);
const oemManufacturers = [...new Set(oemRefs.map(r => r.manufacturer))];

document.oem_numbers = oemNumbers.length > 0 ? oemNumbers : undefined;
document.oem_manufacturers = oemManufacturers.length > 0 ? oemManufacturers : undefined;
```

---

## Summary

This format provides:
1. ✓ **Fast OEM lookup** - Indexed `oem_numbers` array
2. ✓ **Cascade fitment** - Faceted make/model/year arrays
3. ✓ **Multi-vendor** - Vendor codes stored as objects
4. ✓ **Dynamic specs** - Single faceted array for all attributes
5. ✓ **Optimal search** - Weighted fields + search blob
6. ✓ **Scalable** - Batch import up to 1000 docs at once

The schema is backward compatible with your current implementation and adds OEM cross-reference support without breaking existing functionality.

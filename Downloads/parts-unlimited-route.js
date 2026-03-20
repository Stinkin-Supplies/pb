// lib/vendors/partsUnlimited.js
// Parts Unlimited price file helpers — types, parsers, mappers.
// Plain JS (no TypeScript) so Turbopack never trips on type syntax.

// ── Constants ─────────────────────────────────────────────────

export const PRODUCT_CODE_TO_CATEGORY = {
  A:  "Street",
  AI: "Icon Lifestyle",
  B:  "Snowmobiles",
  C:  "Common Parts",
  D:  "ATV",
  DM: "Moose ATV",
  E:  "Drag Specialties",
  F:  "MX / Off-Road",
  FM: "Moose Off-Road",
  FT: "Thor Apparel",
  G:  "Watercraft",
  H:  "Scooter",
};

export const HAZARDOUS_LABELS = {
  A: "Aerosol",
  B: "Battery",
  H: "Hazardous",
  O: "ORMD",
  M: "Maintenance Free Battery",
  L: "Lithium Battery",
  N: "No Air Ship Lithium Battery",
};

export const PART_STATUS = {
  W:   "Web Blocked",
  NEW: "New",
  S:   "Standard",
  P:   "Price Change",
  C:   "Closeout",
  D:   "Discontinued",
};

// ── Auth ──────────────────────────────────────────────────────

export function buildPUAuthHeader(dealerNumber, username, password) {
  const encoded = Buffer.from(
    `${dealerNumber}/${username}:${password}`
  ).toString("base64");
  return `Basic ${encoded}`;
}

// ── CSV parsing ───────────────────────────────────────────────

export function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else if (ch !== "\r") {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(content) {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = parseCSVLine(headerLine);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// ── Value parsers ─────────────────────────────────────────────

export function parsePrice(val) {
  return parseFloat((val ?? "0").replace(/[^0-9.]/g, "")) || 0;
}

export function parseAvailability(val) {
  const v = (val ?? "").trim();
  if (!v || v === "N/A") return 0;
  if (v === "+") return 10;
  return parseInt(v, 10) || 0;
}

export function parseNationalAvailability(val) {
  const v = (val ?? "").trim();
  if (!v || v === "N/A") return 0;
  if (v === "+") return 99;
  return parseInt(v, 10) || 0;
}

export function isActivePart(status) {
  const s = (status ?? "").trim().toUpperCase();
  return s !== "D" && s !== "W";
}

export function slugifyPart(description, partNumber) {
  const base = (description ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 60)
    .replace(/-$/, "");

  const suffix = partNumber
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-");

  return `${base}-${suffix}`;
}

// ── Row mappers ───────────────────────────────────────────────

export function mapBaseRow(row) {
  return {
    partNumber:                  row["Part Number"] ?? "",
    punctuatedPartNumber:        row["Punctuated Part Number"] ?? "",
    vendorPartNumber:            row["Vendor Part Number"] ?? "",
    vendorPunctuatedPartNumber:  row["Vendor Punctuated Part Number"] ?? "",
    partStatus:                  row["Part Status"] ?? "S",
    partDescription:             row["Part Description"] ?? "",
    originalRetail:              parsePrice(row["Original Retail"]),
    currentSuggestedRetail:      parsePrice(row["Current Suggested Retail"]),
    baseDealerPrice:             parsePrice(row["Base Dealer Price"]),
    hazardousCode:               row["Hazardous Code"] ?? " ",
    truckPartOnly:               row["Truck Part Only"] ?? " ",
    partAddDate:                 row["Part Add Date"] ?? "",
    wiAvailability:              row["WI Availability"] ?? "0",
    nyAvailability:              row["NY Availability"] ?? "0",
    txAvailability:              row["TX Availability"] ?? "0",
    nvAvailability:              row["NV Availability"] ?? "0",
    ncAvailability:              row["NC Availability"] ?? "0",
    nationalAvailability:        row["National Availability"] ?? "0",
    trademark:                   row["Trademark"] ?? " ",
    adPolicy:                    row["Ad Policy"] ?? "N",
    priceChangedToday:           row["Price Changed Today"] ?? "N",
    unitOfMeasure:               row["Unit of Measure"] ?? "EA",
    lastCatalog:                 row["Last Catalog"] ?? "",
    lastCatalogPage:             row["Last Catalog Page"] ?? "",
    commodityCode:               row["Commodity Code"] ?? "",
    productCode:                 row["Product Code"] ?? "",
    dragPart:                    row["Drag Part"] ?? "N",
    weight:                      parsePrice(row["Weight"]),
    countryOfOrigin:             row["Country of Origin"] ?? "",
    upcCode:                     row["UPC Code"] ?? "",
    brandName:                   row["Brand Name"] ?? "",
    closeoutCatalogIndicator:    row["Closeout Catalog Indicator"] ?? "N",
  };
}

export function mapDealerRow(row) {
  return {
    partNumber:           row["Part Number"] ?? "",
    punctuatedPartNumber: row["Punctuated Part Number"] ?? "",
    yourDealerPrice:      parsePrice(row["Your Dealer Price"]),
  };
}

export function mapToProduct(part, dealerPrice, vendorId) {
  const isMap    = part.adPolicy.trim() === "Y";
  const msrp     = part.currentSuggestedRetail;
  const mapPrice = isMap ? msrp : null;
  const cost     = dealerPrice > 0 ? dealerPrice : part.baseDealerPrice;
  const rawPrice = cost * 1.25;
  const ourPrice = isMap && mapPrice ? Math.max(rawPrice, mapPrice) : rawPrice;
  const category = PRODUCT_CODE_TO_CATEGORY[part.productCode.trim()] ?? "General";
  const inStock  = parseNationalAvailability(part.nationalAvailability) > 0;

  let partAddDate = null;
  if (part.partAddDate && part.partAddDate.length === 8) {
    partAddDate = `${part.partAddDate.slice(0, 4)}-${part.partAddDate.slice(4, 6)}-${part.partAddDate.slice(6, 8)}`;
  }

  return {
    sku:                   part.partNumber,
    slug:                  slugifyPart(part.partDescription, part.partNumber),
    vendor_sku:            part.punctuatedPartNumber,
    name:                  part.partDescription,
    brand_name:            part.brandName || "Parts Unlimited",
    category_name:         category,
    description:           null,
    our_price:             parseFloat(ourPrice.toFixed(2)),
    compare_at_price:      msrp > 0 ? msrp : null,
    map_price:             mapPrice,
    map_floor:             mapPrice,
    dealer_cost:           cost,
    stock_quantity:        parseNationalAvailability(part.nationalAvailability),
    in_stock:              inStock,
    status:                isActivePart(part.partStatus) ? "active" : "discontinued",
    weight_lbs:            part.weight > 0 ? part.weight : null,
    upc_code:              part.upcCode || null,
    country_of_origin:     part.countryOfOrigin || null,
    hazardous_code:        part.hazardousCode.trim() || null,
    truck_only:            part.truckPartOnly.trim() === "T",
    is_map:                isMap,
    is_drag_specialties:   part.dragPart.trim() === "Y",
    is_closeout:           part.closeoutCatalogIndicator.trim() === "Y",
    is_new:                part.partStatus.trim() === "NEW",
    wi_qty:                parseAvailability(part.wiAvailability),
    ny_qty:                parseAvailability(part.nyAvailability),
    tx_qty:                parseAvailability(part.txAvailability),
    nv_qty:                parseAvailability(part.nvAvailability),
    nc_qty:                parseAvailability(part.ncAvailability),
    vendor_id:             vendorId,
    product_code:          part.productCode.trim(),
    commodity_code:        part.commodityCode.trim(),
    part_add_date:         partAddDate,
    last_synced_at:        new Date().toISOString(),
  };
}

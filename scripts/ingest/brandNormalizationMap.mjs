// brandNormalizationMap.mjs
// Single source of truth for brand-name normalization, shared by:
//   - merge_catalog_unified.js (applied at insert time, so every full rebuild stays normalized)
//   - normalize_brands.sql (one-off catch-up UPDATE against whatever is already live)
// Keep these two in sync — this file is the canonical list; normalize_brands.sql is
// generated from it (see scripts/ingest/generate_normalize_brands_sql.mjs).
//
// Mirrors the mapping originally hand-built in normalize_brands.sql (PU/WPS/VTwin brand
// variants -> one canonical display form), extended with 6 entries found by cross-checking
// PU's 515 distinct raw brand strings against WPS's 238 (session: brand-normalization audit,
// no confirmed live DB read — sourced from scripts/ingest/pu-zips/.../BasePriceFile.csv and
// scripts/data/wps_master_item_brand.csv static exports):
//   ALTO PRODUCTS, CRUZ TOOLS/CRUZTOOLS, FUEL TOOL/FUEL-TOOL, GOLAN/GOLAN PRODUCTS,
//   MUC-OFF/MUC-OFF USA, TECH MOUNT/TECHMOUNT

export const BRAND_NORMALIZATION_MAP = {
  // A
  'Accel': 'Accel', 'ACCEL': 'Accel',
  'ACCUTRONIX': 'Accutronix',
  'AEE': 'AEE',
  'ALL BALLS': 'All Balls Racing', 'All Balls Racing': 'All Balls Racing',
  'ALLOY ART': 'Alloy Art',
  'Alto': 'Alto Products', 'ALTO': 'Alto Products', 'ALTO PRODUCTS': 'Alto Products',
  'Andrews': 'Andrews', 'ANDREWS': 'Andrews',
  'Anti Gravity Battery': 'Antigravity Batteries', 'ANTIGRAVITY': 'Antigravity Batteries',
  'Arlen Ness': 'Arlen Ness', 'ARLEN NESS': 'Arlen Ness',
  'Autolite': 'Autolite', 'AUTOLITE': 'Autolite',
  'AVON': 'Avon', 'AVON GRIPS': 'Avon', 'Avon Tyres': 'Avon',

  // B
  'BAGGERNATION': 'Paul Yaffe Bagger Nation', 'PAUL YAFFE BAGGER NATION': 'Paul Yaffe Bagger Nation',
  'Barnett': 'Barnett', 'BARNETT': 'Barnett',
  'BASSANI XHAUST': 'Bassani',
  'Bates': 'Bates',
  'Belt Drive LTD.': 'Belt Drives Ltd', 'BELT DRIVES LTD.': 'Belt Drives Ltd',
  'BILTWELL': 'Biltwell',
  'BURLY BRAND': 'Burly Brand',

  // C
  'CHAMPION': 'Champion', 'Champion': 'Champion',
  'CHRIS PRODUCTS': 'Chris Products', 'Chris Products': 'Chris Products',
  'CIRO': 'Ciro',
  'CLYMER': 'Clymer', 'Clymer Manuals': 'Clymer',
  'COBRA': 'Cobra',
  'Colony': 'Colony', 'COLONY': 'Colony', 'COLONY MACHINE': 'Colony',
  'Cometic': 'Cometic', 'COMETIC': 'Cometic',
  'COMPUFIRE': 'Compufire', 'COMPU-FIRE': 'Compufire',
  'Corbin Gentry': 'Corbin',
  'CUSTOM DYNAMICS': 'Custom Dynamics',
  'Cycle Electric': 'Cycle Electric', 'CYCLE ELECTRIC': 'Cycle Electric', 'CYCLE ELECTRIC INC': 'Cycle Electric',
  'CYCLE PRO': 'Cycle Pro', 'CYCLE PRO LLC': 'Cycle Pro',
  'CYCLE VISIONS': 'Cycle Visions',
  'CRUZ TOOLS': 'Cruz Tools', 'CRUZTOOLS': 'Cruz Tools',

  // D
  'DANNY GRAY': 'Danny Gray',
  'Daytona Twin Tech': 'Daytona Twin Tec', 'DAYTONA TWIN TEC LLC': 'Daytona Twin Tec',
  'DEI': 'DEI',
  'Diamond Chain': 'Diamond Chain', 'DIAMOND CHAIN': 'Diamond Chain',
  'DID': 'DID', 'D.I.D': 'DID',
  'DOWCO': 'Dowco',
  'DRAG SPECIALTIES': 'Drag Specialties',
  'DRAG SPECIALTIES SEATS': 'Drag Specialties Seats',
  'DRAG SPECIALTIES SHOCKS': 'Drag Specialties Shocks',
  'Dunlop': 'Dunlop', 'DUNLOP': 'Dunlop',
  'Dyna Tek': 'Dynatek', 'DYNATEK': 'Dynatek',
  'Dyno Jet': 'Dynojet', 'DYNOJET': 'Dynojet',

  // E
  'Eastern': 'Eastern Motorcycle Parts', 'EASTERN MOTORCYCLE PARTS': 'Eastern Motorcycle Parts',
  'EBC': 'EBC',
  'EK': 'EK Chains',
  'EMGO': 'Emgo',

  // F
  'FAT BAGGERS INC.': 'Fat Baggers',
  'FRAM': 'Fram', 'Fram': 'Fram',
  'FEULING': 'Feuling', 'FEULING PARTS': 'Feuling',
  'FIGURATI DESIGNS': 'Figurati Designs',
  'FUEL TOOL': 'Fuel Tool', 'FUEL-TOOL': 'Fuel Tool',

  // G
  'GALFER': 'Galfer',
  'Gardner-Westcott': 'Gardner-Westcott', 'GARDNER-WESTCOTT': 'Gardner-Westcott', 'GARDNERWESTCOTT': 'Gardner-Westcott',
  'Gary Bang': 'Gary Bang',
  'GBRAKES': 'GBrakes',
  'GMA Engineering': 'GMA Engineering', 'GMA ENGINEERING BY BDL': 'GMA Engineering',
  'GMAX': 'GMAX',
  'Goodridge': 'Goodridge', 'GOODRIDGE': 'Goodridge',
  'GOLAN': 'Golan Products', 'GOLAN PRODUCTS': 'Golan Products',

  // H
  'HARDDRIVE': 'HardDrive',
  'Hastings Rings': 'Hastings', 'HASTINGS': 'Hastings', 'HASTINGS MFG': 'Hastings',
  'HAWG HALTERS': 'Hawg Halters', 'HAWG HALTERS INC': 'Hawg Halters',
  'HELIX': 'Helix',
  'HIFLOFILTRO': 'HifloFiltro', 'Hiflofiltro': 'HifloFiltro',
  'HIGHWAY 21': 'Highway 21',
  'HOGTUNES': 'Hogtunes',

  // J
  'James': 'James Gaskets', 'JAMES GASKET': 'James Gaskets', 'JAMES GASKETS': 'James Gaskets',
  'Jims': 'Jims', 'JIMS': 'Jims',
  'J & M': 'J&M',
  'JOKER MACHINE': 'Joker Machine',
  'J.W. SPEAKER': 'JW Speaker', 'JW SPEAKER': 'JW Speaker',

  // K
  'KREEM': 'Kreem', 'Kreem': 'Kreem',
  'KB PERFORMANCE': 'KB Performance', 'KB PISTONS': 'KB Performance',
  'KHROME WERKS': 'Khrome Werks',
  'Kibblewhite': 'Kibblewhite', 'KIBBLEWHITE': 'Kibblewhite',
  'KLOCK WERKS': 'Klock Werks',
  'K&L': 'K&L Supply', 'K&L SUPPLY': 'K&L Supply', 'K&L Supply Co.': 'K&L Supply',
  'K & N': 'K&N', 'K&N': 'K&N',
  'KOSO': 'Koso', 'KOSO NORTH AMERICA': 'Koso',
  'K&S': 'K&S Technologies', 'K&S TECHNOLOGIES': 'K&S Technologies',

  // L
  'LA CHOPPERS': 'LA Choppers',
  'LEGEND SUSPENSION': 'Legend Suspension',
  'LE PERA': 'Le Pera',
  'LETRIC LIGHTING CO': 'Letric Lighting',
  'LINDBY': 'Lindby',
  'LYNDALL BRAKES': 'Lyndall Brakes', 'LYNDALL RACING BRAKES LLC': 'Lyndall Brakes',

  // M
  'MAGNUM SHIELDING': 'Magnum Shielding',
  'MCM': 'MCM', 'MCM Bars': 'MCM',
  'MEMPHIS SHADES': 'Memphis Shades',
  'Michelin': 'Michelin', 'MICHELIN': 'Michelin',
  'MIKUNI': 'Mikuni',
  'Motion Pro': 'Motion Pro', 'MOTION PRO': 'Motion Pro',
  'Motobatt': 'Motobatt', 'MOTOBATT': 'Motobatt',
  'MOTO-MASTER': 'Moto-Master',
  'Motorshop': 'Motorshop',
  'MUSTANG': 'Mustang',
  'MUC-OFF': 'Muc-Off', 'MUC-OFF USA': 'Muc-Off',

  // N
  'Namz': 'NAMZ Custom Cycle', 'NAMZ': 'NAMZ Custom Cycle', 'NAMZ CUSTOM CYCLE': 'NAMZ Custom Cycle',
  'National Cycle': 'National Cycle', 'NATIONAL CYCLE': 'National Cycle',
  'NELSON RIGG': 'Nelson-Rigg', 'NELSON-RIGG': 'Nelson-Rigg',
  'NGK': 'NGK', 'NGK SPARK PLUGS': 'NGK',

  // O
  'ODI': 'ODI',

  // P
  'Paughco': 'Paughco', 'PAUGHCO': 'Paughco',
  'PBI': 'PBI',
  'PCRACING': 'PC Racing', 'PC RACING': 'PC Racing',
  'PERFORMANCE MACHINE (PM)': 'Performance Machine',
  'PERFORMANCE TOOL': 'Performance Tool',
  'Pingel': 'Pingel', 'PINGEL': 'Pingel', 'PINGEL ENT': 'Pingel',
  'POWERMADD': 'PowerMadd',
  'POWERTYE': 'PowerTye', 'POWERTYE MFG.': 'PowerTye',
  'PROGRESSIVE SUSPENSION': 'Progressive Suspension', 'Progressive Suspension': 'Progressive Suspension',
  'PRO ONE': 'Pro-One', 'PRO-ONE PERF.MFG.': 'Pro-One',
  'PRO PAD': 'Pro Pad',
  'PSR': 'PSR',

  // R
  'RAM': 'RAM Mounts', 'RAM MOUNTS': 'RAM Mounts',
  'RACE TECH': 'Race Tech', 'Race Tech': 'Race Tech',
  'RC COMPONENTS': 'RC Components', 'RC Components': 'RC Components',
  'REKLUSE': 'Rekluse', 'REKLUSE RACING': 'Rekluse',
  'RIVCO PRODUCTS': 'Rivco',
  'RK': 'RK',
  'RST': 'RST',
  'RWD V-TWIN': 'RWD',

  // S
  'SADDLEMEN': 'Saddlemen',
  'S&S Cycle': 'S&S Cycle', 'S&S CYCLE': 'S&S Cycle',
  'SCORPION EXO': 'Scorpion EXO',
  'SENA': 'Sena',
  'Shinko': 'Shinko', 'SHINKO': 'Shinko',
  'Sifton': 'Sifton',
  'SLIPSTREAMER': 'Slipstreamer',
  'SLYFOX': 'SlyFox',
  'SP CONNECT': 'SP Connect',
  'STANDARD MOTOR PRODUCTS': 'Standard Motor Products', 'Standard Motor Products': 'Standard Motor Products',
  'Sumax': 'Sumax', 'SUMAX': 'Sumax',

  // T
  'THRASHIN SUPPLY CO.': 'Thrashin Supply',
  'THREEBOND': 'Three Bond', 'Three Bond': 'Three Bond',
  'ThunderMax': 'ThunderMax', 'THUNDERMAX': 'ThunderMax',
  'TIMKEN': 'Timken', 'Timken': 'Timken',
  'TRASK': 'Trask Performance',
  'TECH MOUNT': 'Tech Mount', 'TECHMOUNT': 'Tech Mount',

  // U
  'Ultima': 'Ultima',
  'ULTRACOOL': 'Ultracool',
  'Uni-Filter': 'Uni Filter', 'UNI FILTER': 'Uni Filter',

  // V
  'VANCE & HINES': 'Vance & Hines',
  'V-Twin': 'V-Twin',
  'Volt Tech': 'Volt Tech',

  // W
  'WILD 1': 'Wild 1',
  'WILD ASS': 'Wild Ass',
  'WILLIE & MAX': 'Willie & Max', 'WILLIE & MAX LUGGAGE': 'Willie & Max',
  'Wiseco': 'Wiseco', 'WISECO': 'Wiseco',
  'Wyatt Gatling': 'Wyatt Gatling',

  // Y
  'York': 'York',
  'YUASA': 'Yuasa',
};

/**
 * Normalize a raw vendor brand string to its canonical display form.
 * Falls through unchanged if not in the map (mirrors normalize_brands.sql's `ELSE brand`),
 * so brands with only one spelling variant in the wild are left as-is rather than guessed at.
 */
export function normalizeBrand(rawBrand) {
  if (rawBrand == null) return rawBrand;
  const trimmed = String(rawBrand).trim();
  if (trimmed === '') return rawBrand;
  return BRAND_NORMALIZATION_MAP[trimmed] ?? rawBrand;
}

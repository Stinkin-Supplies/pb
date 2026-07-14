// fix_accessories_misc_final.mjs
//
// Applies Laken's complete hand-annotated change_to decisions across the
// FULL remaining 399-row Accessories & Misc bucket (all 399 rows filled,
// no blanks -- confirmed via row-by-row check before building this script).
//
// 357 rows recategorized to real, existing category/subcategory pairs
// (Gaskets & Seals/James Gaskets and Seating/Seat Hardware confirmed live
// via lookup_final_batch_categories.mjs -- all others matched to
// subcategory names already confirmed in earlier lookups this session).
// 42 rows marked "Remove" -- deactivated (is_active=false), NOT hard
// deleted, per the established convention from wave-4b (catalog_unified.id
// is FK-referenced by product_vendors, so hard DELETE fails; deactivation
// achieves "invisible to users" since every query filters on
// is_active=true, and stays reversible). Laken explicitly confirmed all 42
// should be deactivated even though several read as real inventory
// (Utility Containers, Freeway Bars, License Support) rather than obvious
// dealer-junk, unlike the smaller "Remove" batches earlier in this project.
//
// This is expected to close out the Accessories & Misc bucket entirely --
// after this apply, 0 rows should remain with display_subcategory IS NULL
// in Accessories & Misc (barring the single explicitly-skipped mismatch
// from a much earlier pass, if still unresolved).
//
// Usage:
//   node fix_accessories_misc_final.mjs           (dry run, no writes)
//   node fix_accessories_misc_final.mjs --apply   (applies the updates)

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString });

const MOVES = {
  69637: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome 1-1/4 inch Universal Mount Clamp Set
  82704: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Acorn Stem Nut
  82904: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Chrome Allen Type Disc Screw
  82905: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Chrome Allen Type Front Disc Screw
  96062: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Aluminum Head Washers
  78307: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Chrome Billet Nut Set Coarse Thread
  78306: { category: 'Lighting', subcategory: 'Lighting Components & Accessories' }, // Chrome Billet Nut Set Fine Thread
  83245: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Countersunk Washer Set 1/4 inch
  83247: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Countersunk Washer Set 3/8 inch
  83246: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Countersunk Washer Set 5/16 inch
  79153: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Deco Skull
  92977: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Eye Bolt Set
  75356: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome G Clamp
  75357: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome G Clamp
  82779: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Chrome Headbolt
  75269: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome ISO Mount Cover Set
  80436: { category: 'Electrical', subcategory: 'Audio & Communication' }, // Chrome Milled Slots Speaker Grill Set
  79577: { category: 'Engine', subcategory: 'Camchest' }, // Chrome Nose Cover Towel Bar
  79591: { category: 'Engine', subcategory: 'Camchest' }, // Chrome Nose Cover Towel Bar
  68604: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Chrome Plated Stem Nut Kit
  92979: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Chrome Shift Gate Screw
  82778: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Chrome Stock Headbolt with Aluminum Heads
  69636: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Universal Mount Clamp Set 1-1/8 inch
  69638: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Universal Mount Clamp Set 1-3/8 inch
  69635: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Chrome Universal Mount Clamp Set 1 inch
  95134: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Clamp on Rear Mount Block
  95135: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Clamp on Rear Mount Connector
  72354: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' }, // Clamp On USB Charger Outlet
  82100: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Cleveland Greeting Card
  92700: { category: 'Electrical', subcategory: 'Ignition Coil Hardware' }, // Condenser Mount Screw
  66099: { category: 'Engine', subcategory: 'Camchest' }, // Cone Cover Nut Cone Type
  88120: { category: 'Engine', subcategory: 'Camchest' }, // Cone Cover Nut Hex Type Chrome
  88285: { category: 'Engine', subcategory: 'Camchest' }, // Cone Stem Nut Chrome
  88524: { category: 'Electrical', subcategory: 'Ignition Coil Hardware' }, // Control Coil Nuts Nickel Plated
  15627: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // Cover Care Token
  80165: { category: 'Lighting', subcategory: 'Headlights' }, // Cycle Ray Lens Kit
  79589: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // De Dion Motor Engine Model
  91655: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // Diaphragm Cover Plugs Zinc
  79385: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Double Coat Hook
  79656: { category: 'Lighting', subcategory: 'Lighting Components & Accessories' }, // Dress Up Ball Set Chrome
  75365: { category: 'Handlebar & Controls', subcategory: 'Handlebars & Components' }, // Dual Throttle Clamp Black
  79170: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // Early Motorcycles Construction Operation Service
  96153: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Electric Wiring Terminal Screw and Fitting Kit
  76016: { category: 'Tanks & Body', subcategory: 'Fender Trim' }, // Emblem/Trim Mount Strip Set Raw Steel
  84119: { category: 'Engine', subcategory: 'Breathers & Oil System' }, // Engine Cam Oil Transfer Valve
  60340: { category: 'Engine', subcategory: 'Engine Accessories' }, // Evolution Rocker Cover Set
  504862: { category: 'Electrical', subcategory: 'Ignition Switches & Accessories' }, // Fat Bob Key Switch Mount Kit
  41984: { category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps' }, // FATBOB TANK GROMMETS 10 PK
  90968: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Female Terminal Solid Socket Type Terminal
  90192: { category: 'Lighting', subcategory: 'Headlights' }, // Fiber Wiring Terminal Plate with Bolts
  90178: { category: 'Lighting', subcategory: 'Headlights' }, // Fiber Wiring Terminal Plate with Bolts
  86237: { category: 'Transmission & Clutch', subcategory: 'Clutch Kits & Components' }, // Filler Plug Lock Plate
  92405: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Fishpaper Washer 7/32 inch x 5/8 inch
  92413: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Fishpaper Washer 9/32 inch x 7/8 inch
  77608: { category: 'Transmission & Clutch', subcategory: 'Primary & Derby Covers' }, // Flame Cover Set Chrome
  75296: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Flange Nut 5/8 inch x 18
  77286: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Flare Nipple Fitting Nut
  75370: { category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps' }, // Flat Head Fillister Head Slotted Screw 2-64 x 3/8 inch Zinc
  79067: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Flatside Shovelhead Engine Plaque Sign
  58453: { category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps' }, // FLATSIDE TANK GROMMETS 6PK
  94747: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // FL-FX Shovelhead Service Manuel
  80914: { category: 'Frames & Suspension', subcategory: 'Frame' }, // Forging Number Plate with Neck Extension Set
  55629: { category: 'Foot Controls', subcategory: 'Footpegs, Shift Pegs, & HW' }, // FRAME MOUNT SLIDER CHACHO BLUE
  55631: { category: 'Foot Controls', subcategory: 'Footpegs, Shift Pegs, & HW' }, // FRAME MOUNT SLIDER CHACHO BRONZE
  55627: { category: 'Foot Controls', subcategory: 'Footpegs, Shift Pegs, & HW' }, // FRAME MOUNT SLIDER CHACHO GOLD
  55630: { category: 'Foot Controls', subcategory: 'Footpegs, Shift Pegs, & HW' }, // FRAME MOUNT SLIDER CHACHO PURPLE
  55628: { category: 'Foot Controls', subcategory: 'Footpegs, Shift Pegs, & HW' }, // FRAME MOUNT SLIDER CHACHO RED
  91868: { category: 'Handlebar & Controls', subcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware' }, // Friction Spring Throttle Tension Screw
  83042: { category: 'Engine', subcategory: 'Camchest' }, // Front Cone Nut Kit Cadmium
  55245: { category: 'Luggage & Racks', subcategory: 'Tour Pak' }, // FRONT DOCKING KIT CHROME FLH/FLT 97-08
  81046: { category: 'Engine', subcategory: 'Engine Parts' }, // Front Engine Brake Strap
  82889: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Front or Rear Disc Bolts with Nuts for Single Disc
  73896: { category: 'Engine', subcategory: 'Engine Parts' }, // Front Rocker Plate Stud Kit
  95215: { category: 'Engine', subcategory: 'Engine Parts' }, // Front Rocket Stud Nut Lock
  93030: { category: 'Electrical', subcategory: 'Spark Plug' }, // Front Spark Wire Clamp
  75041: { category: 'Foot Controls', subcategory: 'Kickstands & Hardware' }, // Front Stand Spring, Spacer and Washer Set
  83477: { category: 'Engine', subcategory: 'Camchest' }, // Guide Collar Set
  74387: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // G-WL 2 Bolt Manifold Zinc
  82816: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Hardware Dress Up Kit Cadmium
  87089: { category: 'Engine', subcategory: 'Engine Accessories' }, // Headbolt Chrome
  83031: { category: 'Engine', subcategory: 'Engine Accessories' }, // Headbolt Cover Kit Chrome Acorn Type
  61277: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Head Breather Stud Zinc
  75466: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Head Screw
  87281: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Head Stud Set Parkerized
  57082: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // HEAVEY HITTERS 3.0 BAG GAURDS 25-26 SOFTAIL
  82142: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Helicpoter Mechanic Toy
  82102: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Henderson Greeting Card
  82606: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Hex Head Pulley Bolts Zinc Plated 7/16 inch-14 x 1-5/8 inch
  77038: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Hex Reducing Nipple Fitting
  499812: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Hex Stem Nut 1 inch-24 Black
  499798: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Hex Stem Nut 1 inch-24 Chrome
  70309: { category: 'Electrical', subcategory: 'Relays' }, // Hi-Low Beam Switch Relay
  90169: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' }, // Hitachi Starter Field Coil Set
  62251: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Hose Clamp
  62252: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Hose Clamp
  74652: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Hose Clamp Assortment Set
  74101: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Hose Clamp Assortment Set
  85733: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // Hose Clamp Crimping Plier
  77203: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // Hose Forming Coil Set
  77204: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // Hose Forming Coil Set
  91845: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // Idle Mixture Screw
  59141: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // Idler Stud Spacer Set
  506530: { category: 'Electrical', subcategory: 'Points, Distributors & Accessories' }, // Ignition Breaker Kit
  79380: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // inchHow to Restore Your Military Harley-Davidson 1932-1952
  60030: { category: 'Engine', subcategory: 'Camchest' }, // INTAKE GUIDE STANDARD, CAST
  86338: { category: 'Transmission & Clutch', subcategory: 'Mainshaft & Components' }, // Internal Spline Washer
  68175: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // ISO Mount Stud with Spring 1/4 inch x 20
  85476: { category: 'Gaskets & Seals', subcategory: 'James Gaskets' }, // James Rocker Cover Breather Seal
  84715: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // James Super Nut Seal
  63161: { category: 'Transmission & Clutch', subcategory: 'Kickstarters & Hardware' }, // Kick Cover Filler Plug
  62877: { category: 'Transmission & Clutch', subcategory: 'Kickstarters & Hardware' }, // Kick Cover Lever Bushing Zicad Plated
  519004: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // Knucklehead 1940-1947 Repair Manual
  61219: { category: 'Engine', subcategory: 'Breathers & Oil System' }, // Knucklehead Breather Stud Kit
  70189: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Knuckle Nut Set Cadmium Plated
  70188: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Knuckle Nut Set Chrome Plated
  70190: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Knuckle Nut Set Parkerized
  72606: { category: 'Lighting', subcategory: 'Taillights' }, // LED Stop Lamp
  91405: { category: 'Engine', subcategory: 'Bottom End' }, // Left Bearing Bushing Screws
  63033: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Lock and Ring Kit
  63035: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Lock Tab Assortment
  94883: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Long Headbolt
  76170: { category: 'Tanks & Body', subcategory: 'Gas Tanks & Gas Caps' }, // Lower Left Outer Tank shifter Tab
  82605: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // M8 x 1.25 Flange Nut Zinc
  27653: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Magic Power Blocks™
  86300: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Main Bearing Race .002
  63083: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Main Bearing Race .005
  86301: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Main Bearing Race .010
  63082: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Main Bearing Race Standard
  82674: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // Manifold Nipple Kit Weld-On Type
  66007: { category: 'Frames & Suspension', subcategory: 'Triple Trees & Covers' }, // Mega Neck Cup Set Zinc Plated
  42628: { category: 'Frames & Suspension', subcategory: 'Frame' }, // MULTIBARBAR RUBBER PAD KIT 2/PC
  88267: { category: 'Frames & Suspension', subcategory: 'Triple Trees & Covers' }, // Neck Cup Cone Cover Nut Zinc
  77322: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // Nevr-Dull Wadding Polish
  79876: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Nickel Plated Head Primer Cups
  495731: { category: 'Transmission & Clutch', subcategory: 'Rear Belts & Chains' }, // Nickel Plated Secondary Chain 120 Link
  516832: { category: 'Engine', subcategory: 'Engine Accessories' }, // NYC Electrical Ignition Cover 2 Hole
  516834: { category: 'Engine', subcategory: 'Engine Accessories' }, // NYC M8 Electrical Ignition Cover 2 Hole
  516833: { category: 'Engine', subcategory: 'Engine Accessories' }, // NYC TC-88 Electrical Ignition Cover 5 Hole
  82509: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Nyloc Nut 1/4 inch-20 Stainless Steel
  82508: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Nyloc Nut 1/4 inch-28 Stainless Steel
  82503: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Nyloc Nut 3/8 inch-24 Stainless Steel
  82510: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Nyloc Nut 5/16 inch-24 Stainless Steel
  513014: { category: 'Transmission & Clutch', subcategory: 'Chain Belts & Guards' }, // OE Balancer Bracket Assembly
  495690: { category: 'Transmission & Clutch', subcategory: 'Primary Chain Drives' }, // OE Balancer Chain
  513011: { category: 'Transmission & Clutch', subcategory: 'Primary Chain Drives' }, // OE Balancer Shift Bolt Set
  513010: { category: 'Transmission & Clutch', subcategory: 'Primary Chain Drives' }, // OE Balancer Support Screws
  90233: { category: 'Engine', subcategory: 'Engine Accessories' }, // OE Chrome Oil Pressure Sender Unit
  515361: { category: 'Engine', subcategory: 'Engine Parts' }, // OE Engine Return and Feed Fitting Assembly
  515360: { category: 'Engine', subcategory: 'Engine Parts' }, // OE Engine Vent Fitting Assembly Chrome
  93345: { category: 'Seating', subcategory: 'Seat Hardware' }, // OE FLHT/FLTR Trim Piece Black
  94760: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // OE Parts Book for 2011 VRSC
  91864: { category: 'Carburetion & Fuel', subcategory: 'EFI Throttle Bodies' }, // OE Screamin\' Eagle 68mm Throttle Body
  513012: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // OE Sprocket Washer Set
  93959: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' }, // OE Starter Cover Chrome
  93537: { category: 'Transmission & Clutch', subcategory: 'Oil System' }, // Oil Feed Valve Assembly Zinc Plated
  96109: { category: 'Transmission & Clutch', subcategory: 'Oil System' }, // Oil Passage Bolt Cadmium
  96108: { category: 'Transmission & Clutch', subcategory: 'Oil System' }, // Oil Passage Bolt Chrome
  90162: { category: 'Engine', subcategory: 'Engine Accessories' }, // Oil Pressure Sender Unit
  90292: { category: 'Engine', subcategory: 'Engine Accessories' }, // Oil Pressure Sender Unit
  74584: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // OKO Shorty Drain Valve
  74418: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // OKO Single Throttle Disc
  79573: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // One Gallon Oilzum Metal Can
  82531: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Oval Phillips Screw 10-24 x 1/2 inch Stainless Steel
  77387: { category: 'Engine', subcategory: 'Engine Accessories' }, // Oval V-Fire Cover Chrome
  68613: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Oversized Threaded Nipple
  519352: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // Paint and Number Reference Book
  93859: { category: 'Engine', subcategory: 'Engine Accessories' }, // Panhead Cover Set Aluminum
  93831: { category: 'Engine', subcategory: 'Engine Accessories' }, // Panhead Cover Set Chrome
  93718: { category: 'Engine', subcategory: 'Engine Accessories' }, // Panhead Cover Set Chrome
  79059: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Panhead Engine Plaque
  75527: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Panhead Grade 18-8 Machine Screw
  75528: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Panhead Grade J82 Machine Screw
  75526: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Panhead Grade J82 Steel Machine Screw
  79583: { category: 'Engine', subcategory: 'Camchest' }, // Panhead Knucklehead Guide Set
  83173: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Parkerized Headbolt
  83174: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Parkerized Headbolt
  77196: { category: 'Engine', subcategory: 'Engine Accessories' }, // Parkerized Oil Pressure Sender Unit Extension
  69424: { category: 'Frames & Suspension', subcategory: 'Frame' }, // Parkerized Servi-Car Hanger and Clamp Set
  83162: { category: 'Frames & Suspension', subcategory: 'Triple Trees & Covers' }, // Parkerized Stem Nut Spring
  79266: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Patent Metal Medallion Set
  513181: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Phillips Head Chrome Screw
  92758: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Phillips Head Chrome Screws
  82518: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Phillips Machine Screw 4-40 x 5/16 inch Stainless Steel
  95200: { category: 'Engine', subcategory: 'Engine Parts' }, // Pivot Lock Plate
  92933: { category: 'Frames & Suspension', subcategory: 'Rear Shocks & Lowering Kits' }, // Pivot Washer Set Inner
  79061: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // Polished Stainless Steel Speed Ball Wing
  79062: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // Polished Stainless Steel Speed Ball Wing
  64322: { category: 'Transmission & Clutch', subcategory: 'Primary Belt Drives' }, // PRIMARY BELT LARGE SPACER, BLACK OXIDE
  64323: { category: 'Transmission & Clutch', subcategory: 'Primary Belt Drives' }, // PRIMARY BELT LARGE SPACER, ZINC
  75756: { category: 'Transmission & Clutch', subcategory: 'Primary & Derby Covers' }, // Primary Cap Set Chrome
  77868: { category: 'Transmission & Clutch', subcategory: 'Primary & Derby Covers' }, // Primary Loose Parts Kit Raw
  91020: { category: 'Electrical', subcategory: 'Audio & Communication' }, // Radio and BCM Connector Kit
  77373: { category: 'Electrical', subcategory: 'Audio & Communication' }, // Radio Cover
  70806: { category: 'Electrical', subcategory: 'Audio & Communication' }, // Radio Static Plugin
  82144: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Raptor Mechanic Toy
  85974: { category: 'Engine', subcategory: 'Engine Accessories' }, // Ratchet Drum Cover Natural
  89716: { category: 'Lighting', subcategory: 'Lighting Components & Accessories' }, // Rear Cowl Trim Strip
  82940: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Rear Disc Allen Bolt Set
  96256: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Rear Disc Bolt and Nut Kit Chrome
  83226: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Rear Disc Bolt and Nut Kit Chrome
  91061: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Rear Disc Bolt and Nut Kit Zinc
  55251: { category: 'Luggage & Racks', subcategory: 'Tour Pak' }, // REAR DOCKING KIT CHROME FLH/FLT 97-08
  95206: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Rear Hanger Clamp Chrome
  95201: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Rear Hanger Clamp Parkerized
  87468: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Rear Mechanical Brake Locating Block Zinc
  93704: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Rear Remote Reservoir Cover Chrome
  68004: { category: 'Foot Controls', subcategory: 'Floorboards & HW' }, // Rear Replacement Block Style Rubber Pad
  68136: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' }, // Replica Black Waffle Grips without Plug Hole
  89237: { category: 'Handlebar & Controls', subcategory: 'Grips, Heated Grips' }, // Replica Black Waffle Grips with Plug Hole
  88278: { category: 'Engine', subcategory: 'Camchest' }, // Replica Cone Cover Nut Zinc
  93028: { category: 'Engine', subcategory: 'Engine Accessories' }, // Replica Eccentric Points Screw
  62856: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Replica Ratchet Drum Cover Alloy
  44199: { category: 'Frames & Suspension', subcategory: 'Frame' }, // REPL RUBBER STRIPS FOR TWINBAR 3 SHORT/3 LONG
  77592: { category: 'Engine', subcategory: 'Engine Accessories' }, // Ribbed Panhead Cover Set Chrome
  89611: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Ride Control Side Plate Stud Kit
  83645: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Right Crank Case Bushing Screw
  80279: { category: 'Engine', subcategory: 'Engine Accessories' }, // Rocker Cover Set Chrome
  96237: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Rocker Feed Line Nipple Parkerized
  92954: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Rocker Friction tab Washer
  73898: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Rocker Plate Stud Bushings
  63492: { category: 'Transmission & Clutch', subcategory: 'Primary & Derby Covers' }, // Rodan Kick Cover Plug
  79872: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Rod Nut Kit, 1/2 inch x 20 TPI
  24357: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Round Pub Table - 30"
  92707: { category: 'Electrical', subcategory: 'Points, Distributors & Accessories' }, // Safety Gap Plate Screw
  57057: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // SANTORO TUMBLER/HANGER
  85529: { category: 'Carburetion & Fuel', subcategory: 'Air Cleaner & Components' }, // Seal Airbox Tube Base
  90969: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Sealed Connector Component 2 wire
  63135: { category: 'Transmission & Clutch', subcategory: 'Shifter Forks & Gears' }, // Shift Cam Thrust Washers
  92315: { category: 'Transmission & Clutch', subcategory: 'Shifter Forks & Gears' }, // Shift Gate Hex Screw Zinc Plated
  82706: { category: 'Frames & Suspension', subcategory: 'Forks' }, // Short Stud Bushing Set
  74369: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // Shorty Idle Adjustment Screw Rubber
  61124: { category: 'Engine', subcategory: 'Engine Parts' }, // Side Valve Feed Pump Kit
  94815: { category: 'Engine', subcategory: 'Engine Parts' }, // Side Valve Feed Pump Upgrade
  80193: { category: 'Engine', subcategory: 'Engine Parts' }, // Side Valve Feed Pump Upgrade
  79080: { category: 'Luggage & Racks', subcategory: 'Saddlebags' }, // Silver Dollar Concho Set
  77321: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // Simi Chrome Polishing Paste
  72518: { category: 'Lighting', subcategory: 'Lighting Components & Accessories' }, // Skull Style Ornament Chrome
  79330: { category: 'Tanks & Body', subcategory: 'License Plate Mounts, Frames, Lighting, Hardware' }, // Skull with Wings Medallion Set
  82117: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Small Motorcycle Charm
  75532: { category: 'Transmission & Clutch', subcategory: 'Primary & Derby Covers' }, // Socket Cap Bolt Chrome 1/4 inch-20 x 2-1/2 inch
  92905: { category: 'Handlebar & Controls', subcategory: 'Hand Control Sets, Levers' }, // Socket Lever Pin Set Chrome
  45910: { category: 'Frames & Suspension', subcategory: 'Rear Shocks & Lowering Kits' }, // SOFTAIL SWING ARM BUMPERS 00-17 SOFTAILS
  79164: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // Spare Parts Book for 1949-1957 Panhead
  63122: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Sprocket Duo-Seal Nut and Lock Kit
  86212: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Sprocket Lock Tab
  86474: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Sprocket Washer Spacer
  72374: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Square 12 Volt Dual USB Power Charger
  75250: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Stainless Steel Hose Clamps, #24 Size
  504730: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Stainless Steel Top Motor Mount
  74423: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Stainless Steel Worm Clamp with Phillips Screw
  71556: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Stamped Female Crimp Terminals
  71555: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Stamped Male Crimp Terminals
  86718: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' }, // Starter Block Off Kit Zinc
  77420: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' }, // Starter Cover Chrome
  513019: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Steel Sprocket Washer 1.120 inch x .0640 inch
  66532: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Support Rod Stud Repair Kit
  92653: { category: 'Handlebar & Controls', subcategory: 'Switches & Controls' }, // Switch Mounting Screws
  92935: { category: 'Handlebar & Controls', subcategory: 'Switches & Controls' }, // Switch Terminal Screws and Washers
  69502: { category: 'Exhaust', subcategory: 'Exhaust Parts' }, // T-Bolt Set
  95989: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Teardrop Phillips Head Chrome Screw Set
  70746: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Terminal Board Screw Set
  84415: { category: 'Carburetion & Fuel', subcategory: 'Carburetors & Components' }, // Throttle and Idle Adjuster Springs
  511362: { category: 'Handlebar & Controls', subcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware' }, // Throttle Bushing Ferrule Set
  91867: { category: 'Handlebar & Controls', subcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware' }, // Throttle Friction Pad
  62693: { category: 'Frames & Suspension', subcategory: 'Rear Shocks & Lowering Kits' }, // Thrust Bearing
  85990: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Thrust Washer Set
  82174: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Thunder Custom Motorcycle Collector Cards
  60962: { category: 'Engine', subcategory: 'Valves & Valve Train' }, // Titanium Valve Lift Kit
  89715: { category: 'Lighting', subcategory: 'Lighting Components & Accessories' }, // Top Cowl Trim Strip Chrome
  504531: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Top Motor Mount Alloy
  504880: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Top Motor Mount Bracket
  67075: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Top Motor Mount Kit Parkerized
  504868: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Top Motor Mount Natural Stainless Steel
  504530: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Top Motor Mount Stainless
  82146: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Train Mechanic Toy
  82143: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Triceratops Mechainc Toy
  92817: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Tripper Screw
  82141: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Truck Mechanic Toy
  93125: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Truss Rod Right Front Coupling Stud Set Parkerized
  93124: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Truss Rod Right Front Coupling Stud Set Parkerized
  79063: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Twin Cam Plaque
  64289: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Ultima 2 inch Quarter Grill Pulley Cover Polished
  64288: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Ultima 3 inch Quarter Grill Pulley Cover Polished
  75531: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // ULTIMA 6-SPD BOLT,SHCS 5/16 inch-18 X 1-1/2 inch
  75322: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Ultima Binding Head Screw SAE 10-24 x 1/2 inch
  79689: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // Ultima Chain Bracelet 9 inch
  507220: { category: 'Electrical', subcategory: 'Wiring & Components' }, // Ultima Complete Electronic Wiring System
  87359: { category: 'Electrical', subcategory: 'Ignition Coils' }, // Ultima Elctronic Single Fire Ignition
  63249: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Ultima Pillow Block Assembly
  63255: { category: 'Transmission & Clutch', subcategory: 'Transmission Parts' }, // Ultima Pillow Block Assembly
  78405: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Ultima Pulley Brake Dual Disc Spacer Black
  78389: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Ultima Pulley Brake Dual Disc Spacer Polished
  78508: { category: 'Transmission & Clutch', subcategory: 'Pulleys & Sprockets' }, // Ultima Pulley Brake Single Disc Spacer Black
  75327: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Ultima SCHCS Bolt SAE 1/4 inch-20 x 1.25 inch
  65801: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // ULTIMA SCREW
  75326: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Ultima SHCS Bolt SAE 1/4 inch-20 x 0.625 inch
  90023: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Ultima Top Engine Mount
  70050: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Universal Clamp Set
  83259: { category: 'Engine', subcategory: 'Engine Mounts & Hardware' }, // Upper and Lower Chrome Engine Bolts
  87282: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Upper Bracket and Lock Kit Cadmium Plated
  85596: { category: 'Engine', subcategory: 'Engine Parts' }, // UPPER ROCKER COVER RUBBER
  71005: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // USB Engine Management System
  71003: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // USB Engine Management System
  71002: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // USB Engine Management System
  71004: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // USB Engine Management System
  71014: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // USB Engine Management System
  70752: { category: 'Electrical', subcategory: 'Electrical Parts' }, // USB Plug Charger
  70587: { category: 'Electrical', subcategory: 'Electrical Parts' }, // USB Power Supply Port
  83478: { category: 'Engine', subcategory: 'Valves & Valve Train' }, // Valve Spacer
  506378: { category: 'Electrical', subcategory: 'Ignition Coils' }, // V-Fire Dual Fire Ignition
  77326: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // VHT Black Epoxy Enamel Gloss Finish
  77323: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // VHT Black Wrinkle Finish
  77325: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // VHT Flame Proof 1350 Black Finish
  77332: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // VHT Heat Silver Finish
  78313: { category: 'Wheels & Tires', subcategory: 'Hubs & Spokes' }, // VL Hub Bearing Race
  94444: { category: 'Wheels & Tires', subcategory: 'Hubs & Spokes' }, // VL Hub Lock Nut Set
  78315: { category: 'Wheels & Tires', subcategory: 'Hubs & Spokes' }, // VL Hub Washer Set
  79874: { category: 'Wheels & Tires', subcategory: 'Hubs & Spokes' }, // VL Wave Washer
  77404: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Volt Pack Cover Chrome
  71001: { category: 'Electrical', subcategory: 'Relays' }, // Volt Tech Start Boost Relay
  84492: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // V-Twin Body Plug Seal Washer
  79620: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Can with Lid
  79114: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Mens Evolution Engine Buckle and Fob Set
  79369: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Metal Box
  79378: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Metal Box
  519498: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Metal Box
  79366: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Metal Box
  519500: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Metal Box
  519499: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Metal Box
  518946: { category: 'Hardware, Covers & General', subcategory: 'Shop Manuals' }, // VTWIN MFG Restoration Parts for Knucklehead
  79428: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Mouse Pad
  79098: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Product Guide
  79305: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // V-Twin Product Sign
  85126: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // V-Twin Washer Seal
  92691: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Washer 3/16 inch X 3/8 inch X 1/32 inch
  84756: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Washer Drain Seal
  84722: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // WASHER-DRAIN SEAL
  81219: { category: 'Frames & Suspension', subcategory: 'Frame' }, // Weld-On Brake Tab Raw
  81254: { category: 'Frames & Suspension', subcategory: 'Frame' }, // Weld On Tab with Bolts
  72820: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Wheel Brake Cylinder Mount Bolts
  87590: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Wheel Cylinder Bolt
  87613: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Wheel Cylinder Swivel Fitting
  87589: { category: 'Brakes', subcategory: 'Brake Hardware' }, // Wheel Cylinder Swivel Fitting
  80721: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Wire Loom Spring Clamp
  90842: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Wiring 6 Pin Socket Insulator
  90840: { category: 'Electrical', subcategory: 'Electrical Parts' }, // Wiring Single Socket Insulator
  79172: { category: 'Hardware, Covers & General', subcategory: 'Merchandising' }, // XLCH Engine Plaque
  62745: { category: 'Tools & Chemicals', subcategory: 'Tools' }, // XL Engine Stand Tool Set
  69914: { category: 'Exhaust', subcategory: 'Exhaust Parts' }, // XL Pipe Clamp Set
  75456: { category: 'Electrical', subcategory: 'Starter Motors, Solenoids & Accessories' }, // XL Starter Screw Set
  63408: { category: 'Transmission & Clutch', subcategory: 'Clutch Kits & Components' }, // York Veloprene Pack Kit
  88117: { category: 'Frames & Suspension', subcategory: 'Triple Trees & Covers' }, // Zinc Ball Neck Cup Set
  77299: { category: 'Tools & Chemicals', subcategory: 'Chemicals & Lubricants' }, // ZincKote Aerosol
  82960: { category: 'Handlebar & Controls', subcategory: 'Hand Control Sets, Levers' }, // Zinc Lever Pivot Screw Set
  75381: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Zinc Plated 7/16 inch-14 Nyloc Lock Nut
  82264: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Zinc Plated 7/16 inch-14 Nyloc Lock Nut
  75093: { category: 'Hardware, Covers & General', subcategory: 'Bolt Kits, Hardware Assortments & Replenishment' }, // Zinc Plated 7/16 inch-20 Lock Nut
};

const DEACTIVATE_IDS = [79384, 82044, 32100, 31944, 57248, 57249, 56149, 55054, 24343, 57250, 56160, 74288, 64294, 75470, 81983, 85653, 14064, 75465, 60779, 64427, 75471, 75507, 516786, 75508, 507222, 75447, 63362, 64290, 24346, 56885, 56882, 56887, 56883, 56884, 56881, 57423, 79058, 79068, 79099, 79065, 79073, 57422];

async function applyMove(client, id, category, subcategory, applied) {
  const curRes = await client.query(
    `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`,
    [id]
  );
  if (curRes.rows.length === 0) {
    console.log(`  [${id}] NOT FOUND -- skipping`);
    return;
  }
  const cur = curRes.rows[0];
  console.log(`  [${id}] ${cur.name} | ${cur.display_category}/${cur.display_subcategory ?? 'NULL'} -> ${category}/${subcategory}`);
  if (APPLY) {
    const res = await client.query(
      `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
      [category, subcategory, id]
    );
    if (res.rowCount === 1) applied.count++;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN (no writes) ===\n');
    const applied = { count: 0 };

    console.log(`--- Recategorize (${Object.keys(MOVES).length} rows) ---`);
    for (const [idStr, dest] of Object.entries(MOVES)) {
      await applyMove(client, Number(idStr), dest.category, dest.subcategory, applied);
    }

    console.log(`\n--- Deactivate ("Remove", ${DEACTIVATE_IDS.length} rows) ---`);
    for (const id of DEACTIVATE_IDS) {
      const curRes = await client.query(`SELECT id, name, is_active FROM catalog_unified WHERE id = $1`, [id]);
      if (curRes.rows.length === 0) {
        console.log(`  [${id}] NOT FOUND -- skipping`);
        continue;
      }
      const cur = curRes.rows[0];
      console.log(`  [${id}] ${cur.name} | is_active: ${cur.is_active} -> false`);
      if (APPLY) {
        const res = await client.query(`UPDATE catalog_unified SET is_active = false WHERE id = $1`, [id]);
        if (res.rowCount === 1) applied.count++;
      }
    }

    if (APPLY) {
      const checkRes = await client.query(`
        SELECT COUNT(*)::int AS n FROM catalog_unified
        WHERE display_category = 'Accessories & Misc' AND display_subcategory IS NULL AND is_active = true
      `);
      console.log(`\nAccessories & Misc remaining NULL-subcategory rows after this apply: ${checkRes.rows[0].n}`);
    }

    console.log('\n=== Summary ===');
    console.log(`Recategorize candidates: ${Object.keys(MOVES).length}`);
    console.log(`Deactivate candidates: ${DEACTIVATE_IDS.length}`);
    console.log(`Total: ${Object.keys(MOVES).length + DEACTIVATE_IDS.length}`);
    if (APPLY) {
      console.log(`Applied: ${applied.count}`);
      console.log('\nRemember: Typesense re-sync/reindex still needed after this.');
    } else {
      console.log('\nDry run only -- no writes made. Re-run with --apply to write changes.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});

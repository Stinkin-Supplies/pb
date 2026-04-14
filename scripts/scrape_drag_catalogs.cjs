#!/usr/bin/env node
/**
 * Drag Specialties Catalog Scraper
 * Automatically navigates and extracts fitment/OEM data
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

const CATALOGS = {
  fatbook: 'https://asset.dragspecialties.com/static/sites/flippers/2026-Drag-Specialties-FatBook/2043/',
  oldbook: 'https://asset.dragspecialties.com/static/sites/flippers/2026-2027-Drag-Specialties-OldBook/',
};

async function scrapeCatalog(catalogUrl, catalogName) {
  console.log(`\n🚀 Starting ${catalogName} scraper...`);
  
  const browser = await puppeteer.launch({
    headless: false, // Watch it work!
    defaultViewport: { width: 1920, height: 1080 },
  });
  
  const page = await browser.newPage();
  await page.goto(catalogUrl, { waitForNetworkIdle: 'networkidle2', timeout: 60000 });
  
  console.log('✅ Catalog loaded!\n');
  await page.waitForTimeout(3000);
  
  // Navigate to page 1 (first page of content, usually page 5-6 in the PDF)
  console.log('📍 Navigating to start of catalog...\n');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Home'); // Try Home key
    await page.waitForTimeout(500);
  }
  
  // Alternative: Press left arrow multiple times to reach beginning
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
  }
  
  await page.waitForTimeout(2000);
  console.log('✅ At beginning of catalog\n');
  
  const allData = [];
  let currentPage = 1;
  const MAX_PAGES = 200; // Safety limit
  
  while (currentPage <= MAX_PAGES) {
    console.log(`📄 Page ${currentPage}...`);
    
    // Extract data
    const pageData = await page.evaluate(() => {
      const data = { tables: [], partNumbers: [] };
      
      // Get all tables
      document.querySelectorAll('table').forEach((table, idx) => {
        const rows = Array.from(table.querySelectorAll('tr')).map(row =>
          Array.from(row.querySelectorAll('td, th')).map(cell => cell.innerText.trim())
        );
        if (rows.length > 0) data.tables.push({ tableIndex: idx, rows });
      });
      
      // Find part numbers
      const text = document.body.innerText;
      const matches = text.match(/\b(?:DS-|0\d{3}-)\d{4,6}\b/g);
      if (matches) data.partNumbers = [...new Set(matches)];
      
      return data;
    });
    
    allData.push({ page: currentPage, ...pageData });
    console.log(`  ✓ ${pageData.tables.length} tables, ${pageData.partNumbers.length} parts\n`);
    
    // Navigate to next page using keyboard
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(2000);
    
    // Check if we've reached the end (page didn't change)
    const currentUrl = page.url();
    await page.waitForTimeout(500);
    const newUrl = page.url();
    
    if (currentUrl === newUrl && currentPage > 5) {
      console.log('  📖 Reached end of catalog\n');
      break;
    }
    
    currentPage++;
  }
  
  await browser.close();
  
  // Save results
  const jsonFile = `${catalogName}_data.json`;
  fs.writeFileSync(jsonFile, JSON.stringify(allData, null, 2));
  
  const csvFile = `${catalogName}_parts.csv`;
  const csv = ['PartNumber,Page'].concat(
    allData.flatMap(p => p.partNumbers.map(pn => `${pn},${p.page}`))
  ).join('\n');
  fs.writeFileSync(csvFile, csv);
  
  console.log(`✅ Scraped ${allData.length} pages`);
  console.log(`   JSON: ${jsonFile}`);
  console.log(`   CSV: ${csvFile}\n`);
  
  return allData;
}

async function main() {
  const catalog = process.argv[2] || 'fatbook';
  
  if (catalog === 'both') {
    await scrapeCatalog(CATALOGS.fatbook, 'fatbook');
    await scrapeCatalog(CATALOGS.oldbook, 'oldbook');
  } else {
    await scrapeCatalog(CATALOGS[catalog], catalog);
  }
  
  console.log('🎉 Done!\n');
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Drag Specialties Catalog Scraper
 * Features: Auto-save, Resume from last page, Progress bar, Clean output
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CATALOGS = {
  fatbook: 'https://asset.dragspecialties.com/static/sites/flippers/2026-Drag-Specialties-FatBook/2043/',
  oldbook: 'https://asset.dragspecialties.com/static/sites/flippers/2026-2027-Drag-Specialties-OldBook/',
};

const TOTAL_PAGES = {
  fatbook: 2116,
  oldbook: 2000, // Estimate, will auto-detect
};

function updateProgress(current, total, startTime) {
  const percent = Math.floor((current / total) * 100);
  const barLength = 50;
  const filled = Math.floor((current / total) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = current / elapsed;
  const remaining = (total - current) / rate;
  const eta = remaining > 60 ? `${Math.floor(remaining / 60)}m ${Math.floor(remaining % 60)}s` : `${Math.floor(remaining)}s`;
  
  process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total}) | ETA: ${eta}     `);
}

async function scrapeCatalog(catalogUrl, catalogName) {
  const saveFile = `${catalogName}_progress.json`;
  const outputFile = `${catalogName}_scraped_data.json`;
  
  // Load previous progress
  let allData = [];
  let startPage = 1;
  
  if (fs.existsSync(saveFile)) {
    const saved = JSON.parse(fs.readFileSync(saveFile, 'utf-8'));
    allData = saved.data || [];
    startPage = saved.lastPage + 1;
    console.log(`\n📂 Resuming from page ${startPage}...\n`);
  } else {
    console.log(`\n🚀 Starting fresh scrape of ${catalogName}...\n`);
  }
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const page = await browser.newPage();
  
  // Suppress console errors from page
  page.on('console', () => {});
  page.on('pageerror', () => {});
  
  await page.goto(catalogUrl, { waitForNetworkIdle: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  
  // Navigate to page 1 first (in case catalog opens at a different page)
  if (startPage === 1) {
    console.log('📍 Navigating to page 1...\n');
    
    // Press Home key multiple times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Home');
      await new Promise(r => setTimeout(r, 300));
    }
    
    // Press Left arrow to ensure we're at the beginning
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowLeft');
      await new Promise(r => setTimeout(r, 100));
    }
    
    await new Promise(r => setTimeout(r, 2000));
    console.log('✅ At page 1, starting scrape...\n');
  }
  
  // Navigate to start page if resuming
  if (startPage > 1) {
    console.log(`⏩ Fast-forwarding to page ${startPage}...\n`);
    for (let i = 1; i < startPage; i++) {
      await page.keyboard.press('ArrowRight');
      await new Promise(r => setTimeout(r, 100));
      
      if (i % 50 === 0) {
        process.stdout.write(`\rSkipping to page ${i}...`);
      }
    }
    console.log('\n');
  }
  
  const totalPages = TOTAL_PAGES[catalogName];
  const startTime = Date.now();
  
  for (let currentPage = startPage; currentPage <= totalPages; currentPage++) {
    try {
      // Extract data from current page
      const pageData = await page.evaluate(() => {
        const data = { tables: [], partNumbers: [], fitmentData: [] };
        
        // Get all tables
        document.querySelectorAll('table').forEach((table, idx) => {
          const rows = Array.from(table.querySelectorAll('tr')).map(row =>
            Array.from(row.querySelectorAll('td, th')).map(cell => cell.innerText.trim())
          );
          if (rows.length > 0) data.tables.push({ tableIndex: idx, rows });
        });
        
        // Find part numbers
        const text = document.body.innerText;
        const partMatches = text.match(/\b(?:DS-|0\d{3}-)\d{4,6}\b/g);
        if (partMatches) data.partNumbers = [...new Set(partMatches)];
        
        // Extract fitment patterns
        const fitmentPatterns = [
          /For (?:\d{2}-\d{2}|all|\d{4}-\d{4})\s+(?:Big Twin|Sportster|Dyna|Softail|Touring|FLHT?[A-Z]*|FXST?[A-Z]*|XL[A-Z]*)/gi,
          /Fits (?:\d{2}-\d{2}|all|\d{4}-\d{4})\s+(?:Big Twin|Sportster|Dyna|Softail|Touring|FLHT?[A-Z]*|FXST?[A-Z]*|XL[A-Z]*)/gi,
          /(?:\d{2}-\d{2}|\d{4}-\d{4})\s+(?:Road Glide|Street Glide|Electra Glide|Ultra Limited)/gi,
        ];
        
        fitmentPatterns.forEach(pattern => {
          const matches = text.match(pattern);
          if (matches) {
            matches.forEach(fit => {
              data.fitmentData.push(fit.trim());
            });
          }
        });
        
        // Highlight fitment text on page for visual feedback
        if (data.fitmentData.length > 0) {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while (node = walker.nextNode()) {
            fitmentPatterns.forEach(pattern => {
              if (pattern.test(node.textContent)) {
                const span = document.createElement('span');
                span.style.backgroundColor = 'yellow';
                span.style.color = 'black';
                span.innerHTML = node.textContent.replace(pattern, '<mark style="background:lime;padding:2px;">$&</mark>');
                if (node.parentNode) {
                  node.parentNode.replaceChild(span, node);
                }
              }
            });
          }
        }
        
        return data;
      });
      
      allData.push({ page: currentPage, ...pageData });
      
      // Update progress bar
      updateProgress(currentPage, totalPages, startTime);
      
      // Save progress every 10 pages
      if (currentPage % 10 === 0) {
        fs.writeFileSync(saveFile, JSON.stringify({
          lastPage: currentPage,
          data: allData,
          timestamp: new Date().toISOString(),
        }, null, 2));
      }
      
      // Navigate to next page
      await page.keyboard.press('ArrowRight');
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (error) {
      // Silent error handling - just save and continue
      fs.writeFileSync(saveFile, JSON.stringify({
        lastPage: currentPage,
        data: allData,
        timestamp: new Date().toISOString(),
        lastError: error.message,
      }, null, 2));
    }
  }
  
  await browser.close();
  
  console.log('\n\n✅ Scraping complete!\n');
  
  // Save final results
  fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));
  
  // Create CSV of part numbers
  const allPartNumbers = new Set();
  const allFitment = [];
  allData.forEach(p => {
    p.partNumbers.forEach(pn => allPartNumbers.add(pn));
    if (p.fitmentData) {
      p.fitmentData.forEach(fit => allFitment.push({ page: p.page, fitment: fit }));
    }
  });
  
  const csvFile = `${catalogName}_parts.csv`;
  const csv = ['PartNumber,Page'].concat(
    allData.flatMap(p => p.partNumbers.map(pn => `${pn},${p.page}`))
  ).join('\n');
  fs.writeFileSync(csvFile, csv);
  
  // Create fitment CSV
  const fitmentCsv = ['Page,Fitment'].concat(
    allFitment.map(f => `${f.page},"${f.fitment}"`)
  ).join('\n');
  fs.writeFileSync(`${catalogName}_fitment.csv`, fitmentCsv);
  
  // Clean up progress file
  if (fs.existsSync(saveFile)) {
    fs.unlinkSync(saveFile);
  }
  
  console.log(`📊 Results:`);
  console.log(`   Pages scraped: ${allData.length}`);
  console.log(`   Unique part numbers: ${allPartNumbers.size}`);
  console.log(`   Fitment entries: ${allFitment.length}`);
  console.log(`   JSON: ${outputFile}`);
  console.log(`   CSV: ${csvFile}`);
  console.log(`   Fitment: ${catalogName}_fitment.csv\n`);
  
  return allData;
}

async function main() {
  const catalog = process.argv[2] || 'fatbook';
  
  if (!CATALOGS[catalog]) {
    console.log('Usage: node scrape_catalog.cjs [fatbook|oldbook]');
    process.exit(1);
  }
  
  await scrapeCatalog(CATALOGS[catalog], catalog);
  
  console.log('🎉 Done! You can safely close the browser.\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});

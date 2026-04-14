#!/usr/bin/env node
/**
 * Drag Specialties PDF Catalog Parser
 * Extracts fitment tables, part numbers, OEM references from PDF
 */

const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const path = require('path');

async function parseCatalogPDF(pdfPath) {
  console.log(`\n📄 Parsing PDF: ${path.basename(pdfPath)}\n`);
  
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse();
  const data = await parser.parse(dataBuffer);
  
  console.log(`📊 PDF Info:`);
  console.log(`   Pages: ${data.numpages}`);
  console.log(`   Text length: ${data.text.length} characters\n`);
  
  // Extract part numbers
  const partNumbers = new Set();
  const partNumberPattern = /\b(?:DS-|0\d{3}-)\d{4,6}\b/g;
  const matches = data.text.match(partNumberPattern);
  if (matches) {
    matches.forEach(pn => partNumbers.add(pn));
  }
  
  console.log(`✅ Found ${partNumbers.size} unique part numbers\n`);
  
  // Split into pages and extract fitment tables
  const pages = data.text.split(/Page \d+/);
  const fitmentData = [];
  
  console.log('🔍 Analyzing pages for fitment data...\n');
  
  pages.forEach((pageText, idx) => {
    // Look for fitment patterns like "For 84-99 Big Twin"
    const fitmentPattern = /For (?:84-99|91-\d{2}|00-\d{2}|\d{2}-\d{2})\s+(?:Big Twin|Sportster|Dyna|Softail|Touring|FLH[A-Z]*|FXS[A-Z]*|XL[A-Z]*)/gi;
    const fitments = pageText.match(fitmentPattern);
    
    if (fitments && fitments.length > 0) {
      console.log(`  Page ${idx + 1}: Found ${fitments.length} fitment entries`);
      
      fitments.forEach(fit => {
        fitmentData.push({
          page: idx + 1,
          fitment: fit.trim(),
          context: pageText.substring(
            Math.max(0, pageText.indexOf(fit) - 100),
            Math.min(pageText.length, pageText.indexOf(fit) + 200)
          ),
        });
      });
    }
    
    // Look for OEM references
    const oemPattern = /OEM[:\s]+([A-Z0-9-]+)/gi;
    const oems = pageText.match(oemPattern);
    
    if (oems && oems.length > 5) {
      console.log(`  Page ${idx + 1}: Found ${oems.length} OEM references`);
    }
  });
  
  console.log(`\n✅ Total fitment entries found: ${fitmentData.length}\n`);
  
  // Save results
  const basename = path.basename(pdfPath, '.pdf');
  
  // Save part numbers
  const partsCsv = ['Part Number'].concat([...partNumbers]).join('\n');
  fs.writeFileSync(`${basename}_part_numbers.csv`, partsCsv);
  console.log(`💾 Saved: ${basename}_part_numbers.csv (${partNumbers.size} parts)`);
  
  // Save fitment data
  const fitmentCsv = ['Page,Fitment,Context'].concat(
    fitmentData.map(f => `${f.page},"${f.fitment}","${f.context.replace(/"/g, '""')}"`)
  ).join('\n');
  fs.writeFileSync(`${basename}_fitment.csv`, fitmentCsv);
  console.log(`💾 Saved: ${basename}_fitment.csv (${fitmentData.length} entries)`);
  
  // Save full extracted text for manual review
  fs.writeFileSync(`${basename}_full_text.txt`, data.text);
  console.log(`💾 Saved: ${basename}_full_text.txt (full catalog text)\n`);
  
  return {
    partNumbers: [...partNumbers],
    fitmentData,
    fullText: data.text,
  };
}

async function main() {
  const pdfPath = process.argv[2];
  
  if (!pdfPath) {
    console.log('Usage: node parse_catalog_pdf.cjs <path-to-pdf>');
    console.log('\nExample:');
    console.log('  node parse_catalog_pdf.cjs ~/Downloads/FatBook_2026.pdf');
    process.exit(1);
  }
  
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ File not found: ${pdfPath}`);
    process.exit(1);
  }
  
  await parseCatalogPDF(pdfPath);
  
  console.log('🎉 Done! Check the CSV and TXT files for extracted data.\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

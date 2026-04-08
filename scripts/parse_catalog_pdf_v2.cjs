#!/usr/bin/env node
/**
 * Drag Specialties PDF Catalog Parser
 * Extracts fitment tables, part numbers, OEM references from PDF
 */

const fs = require('fs');
const PDFParser = require('pdf2json');
const path = require('path');

async function parseCatalogPDF(pdfPath) {
  console.log(`\n📄 Parsing PDF: ${path.basename(pdfPath)}\n`);
  
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    let totalPages = 0;
    let processedPages = 0;
    
    pdfParser.on('pdfParser_dataError', errData => reject(errData.parserError));
    
    pdfParser.on('pdfParser_dataReady', pdfData => {
      totalPages = pdfData.Pages.length;
      console.log(`📊 PDF Info: ${totalPages} pages\n`);
      console.log('⚙️  Extracting text...\n');
      
      // Extract all text with progress
      let fullText = '';
      pdfData.Pages.forEach((page, pageNum) => {
        page.Texts.forEach(text => {
          text.R.forEach(r => {
            fullText += decodeURIComponent(r.T) + ' ';
          });
        });
        fullText += '\n\n';
        
        processedPages = pageNum + 1;
        const progress = Math.floor((processedPages / totalPages) * 100);
        const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
        process.stdout.write(`\r[${bar}] ${progress}% (${processedPages}/${totalPages} pages)`);
      });
      
      console.log('\n');
      console.log(`✅ Text extracted: ${fullText.length.toLocaleString()} characters\n`);
      
      // Extract part numbers
      const partNumbers = new Set();
      const partNumberPattern = /\b(?:DS-|0\d{3}-)\d{4,6}\b/g;
      let matches = fullText.match(partNumberPattern);
      if (matches) {
        matches.forEach(pn => partNumbers.add(pn));
      }
      
      console.log(`✅ Found ${partNumbers.size} unique part numbers\n`);
      
      // Extract fitment data
      const fitmentPattern = /For (?:\d{2}-\d{2}|all)\s+(?:Big Twin|Sportster|Dyna|Softail|Touring|FLH[A-Z]*|FXS[A-Z]*|XL[A-Z]*)/gi;
      matches = fullText.match(fitmentPattern);
      
      const fitmentData = [];
      if (matches) {
        matches.forEach(fit => {
          fitmentData.push(fit.trim());
        });
      }
      
      console.log(`✅ Found ${fitmentData.length} fitment entries\n`);
      
      // Save results
      const basename = path.basename(pdfPath, '.pdf');
      
      // Part numbers CSV
      const partsCsv = ['Part Number'].concat([...partNumbers]).join('\n');
      fs.writeFileSync(`${basename}_part_numbers.csv`, partsCsv);
      console.log(`💾 Saved: ${basename}_part_numbers.csv (${partNumbers.size} parts)`);
      
      // Fitment CSV
      const fitmentCsv = ['Fitment'].concat([...new Set(fitmentData)]).join('\n');
      fs.writeFileSync(`${basename}_fitment.csv`, fitmentCsv);
      console.log(`💾 Saved: ${basename}_fitment.csv (${new Set(fitmentData).size} entries)`);
      
      // Full text
      fs.writeFileSync(`${basename}_full_text.txt`, fullText);
      console.log(`💾 Saved: ${basename}_full_text.txt\n`);
      
      resolve({
        partNumbers: [...partNumbers],
        fitmentData: [...new Set(fitmentData)],
        fullText,
      });
    });
    
    pdfParser.loadPDF(pdfPath);
  });
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
  
  console.log('🎉 Done!\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

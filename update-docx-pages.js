import fs from 'fs';

let content = fs.readFileSync('services/docxGenerator.ts', 'utf-8');

// Add NumberFormat to imports
if (!content.includes('NumberFormat')) {
  content = content.replace('ExternalHyperlink', 'ExternalHyperlink,\n  NumberFormat');
}

// Add page number extraction
const pageNumLogic = `
  // --- EXTRACT START PAGE ---
  let startPage = 1;
  if (data.pages) {
      const match = data.pages.match(/\\d+/);
      if (match) {
          startPage = parseInt(match[0], 10);
      }
  }

  // --- 12. DOCUMENT ASSEMBLY ---`;

content = content.replace('// --- 12. DOCUMENT ASSEMBLY ---', pageNumLogic);

// Add pageNumbers to section properties
content = content.replace(
  'properties: { titlePage: true, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },',
  'properties: { titlePage: true, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, pageNumbers: { start: startPage, formatType: NumberFormat.DECIMAL } } },'
);

// We should also check the continuous section
// properties: { type: SectionType.CONTINUOUS, column: { count: 2, space: 708 }, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
// Maybe it doesn't need startPage because it's continuous. But let's check docx properties.

fs.writeFileSync('services/docxGenerator.ts', content);
console.log("Updated docxGenerator.ts");

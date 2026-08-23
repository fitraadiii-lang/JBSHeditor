import fs from 'fs';

let content = fs.readFileSync('services/geminiService.ts', 'utf-8');

content = content.replace(
  'const content = extractSection("CONTENT");',
  'const contentRaw = extractSection("CONTENT", "END_OF_MANUSCRIPT");\n      const content = contentRaw.replace(/===?\\s*\\*?\\*?END_OF_MANUSCRIPT\\*?\\*?\\s*===?/gi, "").trim();'
);

fs.writeFileSync('services/geminiService.ts', content);
console.log("Fixed extractSection for CONTENT");

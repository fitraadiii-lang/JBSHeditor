import fs from 'fs';

let content = fs.readFileSync('services/docxGenerator.ts', 'utf-8');

// Update regex to include HTML <i> and <b> tags
content = content.replace(
  /const regex = \/\(\\\$\\\$.*?\\\$\\\$\|\\\*\\\*.*?\\\*\\\*\|\\\*.*?\\\*\|\\_\\{.*?\\}\|\\_\[0-9a-zA-Z\]\|\\\^\\{.*?\\}\|\\\^\[0-9a-zA-Z\]\)\/g;/,
  'const regex = /(\\$\\$.*?\\$\\$|\\*\\*.*?\\*\\*|\\*.*?\\*|<i>.*?<\\/i>|<b>.*?<\\/b>|_\\{.*?\\}|_[0-9a-zA-Z]|\\^\\{.*?\\}|\\^[0-9a-zA-Z])/gi;'
);

// Add processing logic for <i> and <b>
content = content.replace(
  /\/\/ --- ITALIC ---/,
  `// --- HTML BOLD ---
    if (part.toLowerCase().startsWith("<b>") && part.toLowerCase().endsWith("</b>")) {
      return new TextRun({
        text: part.slice(3, -4),
        bold: true,
        font: FONT_FAMILY,
        size: fontSize
      });
    }

    // --- HTML ITALIC ---
    if (part.toLowerCase().startsWith("<i>") && part.toLowerCase().endsWith("</i>")) {
      return new TextRun({
        text: part.slice(3, -4),
        italics: true,
        font: FONT_FAMILY,
        size: fontSize
      });
    }

    // --- ITALIC ---`
);

fs.writeFileSync('services/docxGenerator.ts', content);
console.log("Updated docxGenerator.ts");

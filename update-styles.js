import fs from 'fs';

// 1. Update docxGenerator H3 style
let docx = fs.readFileSync('services/docxGenerator.ts', 'utf-8');
docx = docx.replace(
  /heading3: \{ run: \{ font: FONT_FAMILY, bold: true, size: BODY_FONT_SIZE, italics: true, color: "0c4a6e" \}/,
  'heading3: { run: { font: FONT_FAMILY, bold: false, size: BODY_FONT_SIZE, italics: true, color: "0c4a6e" }'
);
fs.writeFileSync('services/docxGenerator.ts', docx);

// 2. Update ArticlePreview H3 style
let article = fs.readFileSync('components/ArticlePreview.tsx', 'utf-8');
article = article.replace(
  /h3: \(\{node, \.\.\.props\}\) => <h3 className="font-bold italic text-\[11pt\] text-\[#0c4a6e\]/g,
  'h3: ({node, ...props}) => <h3 className="italic text-[11pt] text-[#0c4a6e]'
);
fs.writeFileSync('components/ArticlePreview.tsx', article);

console.log("Updated heading styles");

import fs from 'fs';

// 1. Update docxGenerator
let docx = fs.readFileSync('services/docxGenerator.ts', 'utf-8');
docx = docx.replace(
  /heading2: \{ run: \{ font: FONT_FAMILY, bold: true, size: BODY_FONT_SIZE, color: "000000" \}/,
  'heading2: { run: { font: FONT_FAMILY, bold: true, size: BODY_FONT_SIZE, color: "0c4a6e" }'
);
docx = docx.replace(
  /heading3: \{ run: \{ font: FONT_FAMILY, bold: false, size: BODY_FONT_SIZE, italics: true, color: "0c4a6e" \}/,
  'heading3: { run: { font: FONT_FAMILY, bold: true, size: BODY_FONT_SIZE, italics: true, color: "0c4a6e" }'
);
fs.writeFileSync('services/docxGenerator.ts', docx);
console.log("Updated docxGenerator.ts");

// 2. Update ArticlePreview
let preview = fs.readFileSync('components/ArticlePreview.tsx', 'utf-8');

preview = preview.replace(
  /prose-h2:text-\[11pt\] prose-h2:mt-4 prose-h2:mb-2 prose-h2:leading-tight prose-h2:normal-case/,
  'prose-h2:text-[11pt] prose-h2:mt-4 prose-h2:mb-2 prose-h2:leading-tight prose-h2:normal-case prose-h2:text-[#0c4a6e]'
);

preview = preview.replace(
  /prose-h3:text-\[11pt\] prose-h3:mt-3 prose-h3:mb-1 prose-h3:italic prose-h3:normal-case prose-h3:text-\[#0c4a6e\]/,
  'prose-h3:text-[11pt] prose-h3:mt-3 prose-h3:mb-1 prose-h3:italic prose-h3:font-bold prose-h3:normal-case prose-h3:text-[#0c4a6e]'
);

preview = preview.replace(
  /h2: \(\{node, \.\.\.props\}\) => <h2 className="font-bold text-\[11pt\] mt-6 mb-2 break-after-avoid"/,
  'h2: ({node, ...props}) => <h2 className="font-bold text-[11pt] text-[#0c4a6e] mt-6 mb-2 break-after-avoid"'
);

preview = preview.replace(
  /h3: \(\{node, \.\.\.props\}\) => <h3 className="italic text-\[11pt\] text-\[#0c4a6e\] mt-4 mb-2 break-after-avoid"/,
  'h3: ({node, ...props}) => <h3 className="font-bold italic text-[11pt] text-[#0c4a6e] mt-4 mb-2 break-after-avoid"'
);

fs.writeFileSync('components/ArticlePreview.tsx', preview);
console.log("Updated ArticlePreview.tsx");


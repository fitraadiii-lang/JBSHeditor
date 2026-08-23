import fs from 'fs';

let content = fs.readFileSync('components/ArticlePreview.tsx', 'utf-8');

const matchPageLogic = `
  let startPage = 1;
  if (data.pages) {
      const match = data.pages.match(/\\d+/);
      if (match) {
          startPage = parseInt(match[0], 10);
      }
  }

  return (
`;

content = content.replace(/return \(/, matchPageLogic);

content = content.replace(
  /<span className="font-bold text-xs">1<\/span>/,
  '<span className="font-bold text-xs">{startPage}</span>'
);

fs.writeFileSync('components/ArticlePreview.tsx', content);
console.log("Updated ArticlePreview.tsx pages logic");

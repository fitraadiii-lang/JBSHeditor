import fs from 'fs';

let content = fs.readFileSync('components/ArticlePreview.tsx', 'utf-8');

// Add import
content = content.replace(
  /import rehypeKatex from 'rehype-katex';/,
  "import rehypeKatex from 'rehype-katex';\nimport rehypeRaw from 'rehype-raw';"
);

// Add plugin
content = content.replace(
  /rehypePlugins=\\{\\[rehypeKatex\\]\\}/,
  "rehypePlugins={[rehypeRaw, rehypeKatex]}"
);

fs.writeFileSync('components/ArticlePreview.tsx', content);
console.log("Updated ArticlePreview.tsx");

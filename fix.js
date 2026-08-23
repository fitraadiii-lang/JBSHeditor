import fs from 'fs';

let content = fs.readFileSync('components/ArticlePreview.tsx', 'utf-8');

// Step 1: Remove it from everywhere
content = content.replace(/  let startPage = 1;\n  if \(data\.pages\) \{\n      const match = data\.pages\.match\(\/\\\\d\+\/\);\n      if \(match\) \{\n          startPage = parseInt\(match\[0\], 10\);\n      \}\n  \}\n/g, '');

// Step 2: Inject it before the main return
const target = `  return (
    <div className="w-full h-full overflow-auto bg-gray-200 p-4 md:p-8 flex justify-center print:p-0 print:bg-white print:overflow-visible">`;

const injection = `  let startPage = 1;
  if (data.pages) {
      const match = data.pages.match(/\\d+/);
      if (match) {
          startPage = parseInt(match[0], 10);
      }
  }

  return (
    <div className="w-full h-full overflow-auto bg-gray-200 p-4 md:p-8 flex justify-center print:p-0 print:bg-white print:overflow-visible">`;

if (content.includes(target)) {
    content = content.replace(target, injection);
    fs.writeFileSync('components/ArticlePreview.tsx', content);
    console.log("Fixed startPage scope!");
} else {
    console.log("Could not find the target to inject into");
}

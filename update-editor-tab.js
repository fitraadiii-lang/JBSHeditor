import fs from 'fs';

let content = fs.readFileSync('components/Editor.tsx', 'utf-8');

content = content.replace(
  /setActiveTab\(EditorTab\.CONTENT\);/,
  'setActiveTab(EditorTab.PREVIEW);'
);

fs.writeFileSync('components/Editor.tsx', content);
console.log("Updated Editor.tsx");

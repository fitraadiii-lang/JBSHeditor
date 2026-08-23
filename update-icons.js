import fs from 'fs';
let content = fs.readFileSync('components/Editor.tsx', 'utf-8');
content = content.replace(/CheckCircle,/, 'CheckCircle, AlertCircle,');
fs.writeFileSync('components/Editor.tsx', content);
console.log("Updated icons in Editor.tsx");

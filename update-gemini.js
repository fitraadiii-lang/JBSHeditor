const fs = require('fs');
let code = fs.readFileSync('services/geminiService.ts', 'utf-8');

code = code.replace(
  /const extractSection = \(tag: string, nextTag\?: string\) => \{/,
  `const extractSection = (tag: string, nextTag?: string) => {
        if (tag === "CONTENT" && text.indexOf(\`===\${tag}===\`) === -1) {
            return text; // fallback to return all text if CONTENT tag is missing
        }`
);

fs.writeFileSync('services/geminiService.ts', code);
console.log("Updated geminiService.ts");

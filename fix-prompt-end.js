import fs from 'fs';

let content = fs.readFileSync('services/geminiService.ts', 'utf-8');

// Update the output format prompt to include the end marker
const promptReplacement = `    ===CONTENT===
    (STARTING FROM THE INTRODUCTION, COPY PASTE THE ENTIRE REMAINING MANUSCRIPT TEXT HERE. PLEASE DO NOT STOP UNTIL THE LAST WORD OF THE REFERENCES. PLEASE WRITE EVERY SINGLE WORD AND PARAGRAPH FROM THE INPUT TEXT EXACTLY AS IT IS.)
    ===END_OF_MANUSCRIPT===
  \`;`;

content = content.replace(
  /    ===CONTENT===\n    \(STARTING FROM THE INTRODUCTION, COPY PASTE THE ENTIRE REMAINING MANUSCRIPT TEXT HERE\. PLEASE DO NOT STOP UNTIL THE LAST WORD OF THE REFERENCES\. PLEASE WRITE EVERY SINGLE WORD AND PARAGRAPH FROM THE INPUT TEXT EXACTLY AS IT IS\.\)\n  `;/,
  promptReplacement
);

fs.writeFileSync('services/geminiService.ts', content);
console.log("Updated prompt to require END_OF_MANUSCRIPT marker");

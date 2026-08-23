import fs from 'fs';

let content = fs.readFileSync('services/geminiService.ts', 'utf-8');

content = content.replace(
  /\* Heading 1: Use # \(e\.g\., # METHODS\)/g,
  "* Heading 1: Use # and MUST INCLUDE sequential numbering (e.g., # 1. INTRODUCTION, # 2. METHODS, # 3. RESULT)"
);

content = content.replace(
  /\* Heading 2: Use ## \(e\.g\., ## Study Design, Setting, and Period\)/g,
  "* Heading 2: Use ## and MUST INCLUDE sequential hierarchical numbering (e.g., ## 3.1 Study Design, ## 3.2 Statistical Analysis)"
);

content = content.replace(
  /\* Heading 3: Use ### \(e\.g\., ### White bread production\)\. Ensure it is on its own line and DOES NOT merge with the body text paragraph\./g,
  "* Heading 3: Use ### and MUST INCLUDE sequential hierarchical numbering (e.g., ### 3.2.1 Normality and Homogeneity). Ensure it is on its own line and DOES NOT merge with the body text paragraph."
);

fs.writeFileSync('services/geminiService.ts', content);
console.log("Updated geminiService.ts");

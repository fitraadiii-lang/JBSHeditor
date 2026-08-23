import fs from 'fs';

let content = fs.readFileSync('services/fileExtraction.ts', 'utf-8');

const target = `      if (lastY !== item.transform[5] && lastY !== -1) {
        // If Y coordinate changes significantly, it's a new line
        if (Math.abs(lastY - item.transform[5]) > 4) {
            pageText += '\\n';
        } else {
            // It's likely on the same line, just slightly offset
            if (!pageText.endsWith(' ') && !item.str.startsWith(' ')) {
                pageText += ' ';
            }
        }
      }`;

const replacement = `      if (lastY !== item.transform[5] && lastY !== -1) {
        // If Y coordinate changes significantly, it's a new line
        if (Math.abs(lastY - item.transform[5]) > 4) {
            pageText += '\\n';
        } else {
            // It's likely on the same line, just slightly offset (e.g. superscript/subscript).
            // Do NOT blindly add a space here, it artificially inflates word counts 
            // when PDF.js reads individual letters with slight baseline shifts.
        }
      }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('services/fileExtraction.ts', content);
    console.log("Fixed fileExtraction.ts to stop adding artificial spaces");
} else {
    console.log("Could not find target in fileExtraction.ts");
}

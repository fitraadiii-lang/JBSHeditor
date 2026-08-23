import fs from 'fs';

let content = fs.readFileSync('components/Editor.tsx', 'utf-8');

const target = `<div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <span className="text-sm text-gray-700">Word Count (Body)</span>
                    <span className="text-sm font-bold text-gray-900">{qcStats.wordCount}</span>
                  </div>`;

const replacement = `<div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <span className="text-sm text-gray-700">Word Count (Body)</span>
                    <span className="text-sm font-bold text-gray-900">{qcStats.wordCount}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <span className="text-sm text-gray-700">Total Extracted Words</span>
                    <span className="text-sm font-bold text-gray-900">{qcStats.wordCount + (data.abstract || '').trim().split(/\\s+/).length + (data.title || '').trim().split(/\\s+/).length}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <span className="text-sm text-gray-700">Raw Source Words (PDF/DOCX)</span>
                    <span className="text-sm font-bold text-gray-900">{rawWordCount}</span>
                  </div>`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('components/Editor.tsx', content);
    console.log("Updated QC tab to show detailed word counts");
} else {
    console.log("Target not found");
}

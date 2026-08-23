import fs from 'fs';

let content = fs.readFileSync('components/Editor.tsx', 'utf-8');

// Update qcStats
content = content.replace(
  /return \{\n\s*wordCount,\n\s*transferPercentage,\n\s*sections: \{ hasIntro, hasMethods, hasResults, hasDiscussion, hasReferences \},\n\s*refCount,\n\s*figureCount,\n\s*tableCount\n\s*\};/,
  `const auditMessages: string[] = [];
    let isReady = true;

    if (!title || title.trim().length < 5) {
       auditMessages.push("Title is missing or too short.");
       isReady = false;
    }
    if (!abstract || abstract.trim().length < 30) {
       auditMessages.push("Abstract is missing or too short.");
       isReady = false;
    }
    if (!data.authors || data.authors.length === 0) {
       auditMessages.push("No authors added.");
       isReady = false;
    }
    if (wordCount < 300) {
       auditMessages.push("Body word count is very low (< 300 words).");
       isReady = false;
    }
    if (!hasIntro || !hasReferences) {
       auditMessages.push("Missing core sections (Introduction or References).");
       isReady = false;
    }
    if (!hasMethods || !hasResults || !hasDiscussion) {
       auditMessages.push("Missing standard research sections (Methods, Results, or Discussion).");
       // We can allow review articles to skip these, but let's encourage them or just warn.
    }
    if (transferPercentage < 70 && rawWordCount > 0) {
       auditMessages.push("Content Transfer Ratio is below 70%. Some text might be missing.");
    }
    if (figureCount !== (data.figures || []).length) {
       auditMessages.push("Mismatch between uploaded figures and figures referenced in text.");
    }
    
    return {
      wordCount,
      transferPercentage,
      sections: { hasIntro, hasMethods, hasResults, hasDiscussion, hasReferences },
      refCount,
      figureCount,
      tableCount,
      isReady,
      auditMessages
    };`
);

fs.writeFileSync('components/Editor.tsx', content);
console.log("Updated qcStats in Editor.tsx");

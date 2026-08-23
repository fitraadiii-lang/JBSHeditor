import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure PDF.js worker
// Handle different export structures (default vs named) for pdfjs-dist
// @ts-ignore
const pdfjs = pdfjsLib.default || pdfjsLib;

if (pdfjs.GlobalWorkerOptions) {
  // Use cdnjs for the worker as it is a standard UMD script which avoids some ESM worker issues
  // and CORS issues that can occur with esm.sh module workers
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export const extractTextFromFile = async (file: File): Promise<string> => {
  const fileType = file.type;
  
  try {
    if (fileType === 'application/pdf') {
      return await extractTextFromPDF(file);
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      file.name.endsWith('.docx')
    ) {
      return await extractTextFromDocx(file);
    } else if (fileType === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      return await extractTextFromTxt(file);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    console.error("Extraction error:", error);
    // Throwing a string or Error object that can be caught by the UI
    throw new Error(error instanceof Error ? error.message : "Failed to extract text from file.");
  }
};

const extractTextFromTxt = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

const extractTextFromDocx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  // @ts-ignore
  const mammothLib = mammoth.default || mammoth;
  const result = await mammothLib.extractRawText({ arrayBuffer });
  return result.value;
};

const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  // Use generic types or any to avoid strict typing issues with the dynamic import
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    let pageText = '';
    let lastY = -1;
    
    for (const item of textContent.items) {
      if (!item.str.trim() && item.str !== ' ') continue; // Skip empty items but keep spaces
      
      if (lastY !== item.transform[5] && lastY !== -1) {
        // If Y coordinate changes significantly, it's a new line
        if (Math.abs(lastY - item.transform[5]) > 4) {
            pageText += '\n';
        } else {
            // It's likely on the same line, just slightly offset (e.g. superscript/subscript).
            // Do NOT blindly add a space here, it artificially inflates word counts 
            // when PDF.js reads individual letters with slight baseline shifts.
        }
      }
      pageText += item.str;
      lastY = item.transform[5];
    }
        
    fullText += pageText + '\n\n';
  }

  return fullText;
};
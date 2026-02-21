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
    
    // CHANGED: Join with newline instead of space to preserve line breaks
    // This fixes the issue where titles, authors, and abstract merge into one block
    const pageText = textContent.items
        .map((item: any) => item.str)
        .join('\n');
        
    fullText += pageText + '\n\n';
  }

  return fullText;
};
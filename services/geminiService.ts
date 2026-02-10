import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ManuscriptData } from "../types";

// Define the schema for the manuscript output
const authorSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    affiliation: { type: Type.STRING },
    email: { type: Type.STRING, nullable: true },
  },
  required: ["name", "affiliation"],
};

const sectionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    heading: { type: Type.STRING, description: "The section title (e.g., Introduction, Methods)" },
    content: { type: Type.STRING, description: "The body text of the section." },
  },
  required: ["heading", "content"],
};

const manuscriptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    authors: { type: Type.ARRAY, items: authorSchema },
    abstract: { type: Type.STRING },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    sections: { type: Type.ARRAY, items: sectionSchema },
    references: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["title", "authors", "abstract", "keywords", "sections", "references"],
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// --- MANUAL MODE (Helper) ---
export const createManualManuscript = (text: string): ManuscriptData => {
  const cleanText = text.replace(/<[^>]*>/g, '\n').trim(); 
  const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
  
  const title = lines.length > 0 ? lines[0] : "Untitled Manuscript";
  const bodyContent = lines.slice(1).join('\n\n') || "Paste your manuscript content here...";

  return {
    title: title,
    authors: [
      { name: "Author Name", affiliation: "Affiliation", email: "email@example.com" }
    ],
    abstract: "Abstract content...",
    keywords: ["Keyword1", "Keyword2"],
    sections: [
      {
        heading: "Main Content",
        content: bodyContent
      }
    ],
    references: ["Reference 1"],
    doi: "10.xxxxx/jbsh.vX.iX.xxxx",
    volume: "3",
    issue: "1",
    year: new Date().getFullYear().toString(),
    pages: "1-12",
    receivedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    acceptedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    publishedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    figures: [],
    logoUrl: "https://raw.githubusercontent.com/stackblitz/stackblitz-images/main/jbsh-logo-placeholder.png"
  };
};

export const parseManuscript = async (text: string): Promise<ManuscriptData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // REVERT: Use Flash first (faster, more stable). Fallback to Pro only if needed.
  // This restores the behavior before the "Strict" update that caused timeouts.
  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview"];

  // REVERT: Relaxed prompt. Removed "VERBATIM" strictness.
  // This allows the model to process large text without hitting token limits/timeouts as easily.
  const prompt = `
    You are an AI Assistant for the Journal of Biomedical Sciences and Health (JBSH).
    Convert the raw manuscript text below into a structured JSON object.

    Instructions:
    1. Organize the content into: Title, Authors, Abstract, Keywords, Sections (IMRAD), and References.
    2. Preserve the core content and paragraphs. 
    3. Fix obvious formatting issues (like line breaks in the middle of sentences).
    4. Remove page numbers or running headers.
    5. Ensure the Output is Valid JSON.

    Input Text:
    ${text}
  `;

  let lastError;

  for (const modelName of modelsToTry) {
    console.log(`Attempting parse with model: ${modelName}`);
    
    // Retry up to 2 times per model
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: manuscriptSchema,
            temperature: 0.1, // Slight flexibility helps with completion
          },
        });

        if (response.text) {
          let cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanText) as ManuscriptData;
          
          if (!parsed.title || !parsed.sections) throw new Error("Incomplete data structure.");

          return {
            ...parsed,
            doi: "10.xxxxx/jbsh.vX.iX.xxxx",
            volume: "3",
            issue: "1",
            year: new Date().getFullYear().toString(),
            pages: "1-12",
            receivedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            acceptedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            publishedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            figures: [],
            logoUrl: "https://raw.githubusercontent.com/stackblitz/stackblitz-images/main/jbsh-logo-placeholder.png" 
          };
        }
        throw new Error("Empty response");

      } catch (error: any) {
        console.warn(`Attempt ${attempt} with ${modelName} failed:`, error);
        lastError = error;
        
        if (error.message?.includes("503") || error.message?.includes("429")) {
          await sleep(2000); 
          continue;
        }
        break; // Break on other errors to try next model
      }
    }
  }

  throw new Error(`Failed to process manuscript. Please try pasting smaller sections or use Manual Mode.`);
};
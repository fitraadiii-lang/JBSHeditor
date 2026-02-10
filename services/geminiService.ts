import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ManuscriptData } from "../types";

// Define the strict schema for the manuscript output
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
    content: { type: Type.STRING, description: "The FULL body text of the section. Keep paragraphs intact." },
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

// --- NEW FUNCTION: MANUAL MODE (NO AI) ---
export const createManualManuscript = (text: string): ManuscriptData => {
  // Simple heuristic: First non-empty line is title, rest is content.
  const cleanText = text.replace(/<[^>]*>/g, '\n').trim(); // Strip HTML for manual mode safety
  const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
  
  const title = lines.length > 0 ? lines[0] : "Untitled Manuscript";
  // Join the rest of the text. Split by double newlines to make paragraphs.
  const bodyContent = lines.slice(1).join('\n\n') || "Paste your manuscript content here...";

  return {
    title: title,
    authors: [
      { name: "Author Name 1", affiliation: "Affiliation 1", email: "author@example.com" },
      { name: "Author Name 2", affiliation: "Affiliation 1" }
    ],
    abstract: "Paste your abstract here...",
    keywords: ["Keyword 1", "Keyword 2"],
    sections: [
      {
        heading: "Full Manuscript Content (Please Organize)",
        content: bodyContent
      }
    ],
    references: ["Reference 1", "Reference 2"],
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
  
  // STRATEGY: 
  // 1. Try "gemini-3-pro-preview" first (High Intelligence, Good for strict formatting).
  // 2. If it fails (503 Busy / Timeout), fallback to "gemini-3-flash-preview" (Faster, Higher Availability).
  const modelsToTry = ["gemini-3-pro-preview", "gemini-3-flash-preview"];

  const prompt = `
    TASK: Extract manuscript data into valid JSON.
    
    RULES:
    1. VERBATIM MODE: Extract content exactly as is. Do not summarize sentences.
    2. STRUCTURE: Identify Title, Authors, Abstract, Keywords, Sections (IMRAD), and References.
    3. CLEANING: Remove page numbers, running heads, and "Figure X" placeholders.
    4. LONG TEXT: If the text is extremely long, ensure the JSON structure remains valid (close all brackets).
    
    INPUT TEXT:
    ${text}
  `;

  let lastError;

  for (const modelName of modelsToTry) {
    console.log(`Attempting parse with model: ${modelName}`);
    
    // Retry loop for transient errors (up to 3 times per model)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: manuscriptSchema,
            temperature: 0, // Deterministic
            maxOutputTokens: 8192, 
          },
        });

        if (response.text) {
          // 1. Clean Markdown blocks if present
          let cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
          
          // 2. Attempt to parse
          const parsed = JSON.parse(cleanText) as ManuscriptData;
          
          // 3. Basic validation
          if (!parsed.title || !parsed.sections) throw new Error("Incomplete data structure.");

          // Success! Add default JBSH metadata
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
        throw new Error("Empty response from AI");

      } catch (error: any) {
        console.warn(`Attempt ${attempt} with ${modelName} failed:`, error);
        lastError = error;

        // If error is 503 (Server Busy) or 429 (Too Many Requests), wait and retry
        if (error.message?.includes("503") || error.message?.includes("429") || error.message?.includes("500")) {
          await sleep(2500 * attempt); // Exponential backoff: 2.5s, 5s, 7.5s
          continue;
        }

        // If JSON syntax error (truncated output), break inner loop to switch model immediately
        if (error instanceof SyntaxError || error.message?.includes("JSON")) {
            console.warn("JSON Truncation detected. Switching model...");
            break; 
        }

        // Other errors (Auth, Bad Request) -> Stop immediately
        break;
      }
    }
  }

  // If all attempts with all models fail
  throw new Error(`Failed to process manuscript. Server was busy or text was too long. (Last error: ${lastError?.message})`);
};
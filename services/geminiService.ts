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
    content: { type: Type.STRING, description: "The body text of the section. If tables are detected, they MUST be returned as HTML <table> structures." },
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

const generateLoaBody = (title: string, vol: string, issue: string, year: string) => `
<p>Dear Author(s),</p>
<p>We are pleased to inform you that your manuscript titled:</p>
<div style="background-color: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 4px; margin: 12px 0; font-style: italic; font-weight: bold; text-align: center; font-size: 0.9em;">
    "${title}"
</div>
<p>
    Has been <strong>ACCEPTED</strong> for publication in the <strong>Journal of Biomedical Sciences and Health (JBSH)</strong>, 
    Volume ${vol}, Issue ${issue}, ${year}.
</p>
<p>
    The manuscript has gone through a peer-review process, and our reviewers have recommended it for publication. 
    We appreciate your contribution to the biomedical and health sciences community.
</p>
`;

// --- MANUAL MODE (Helper) ---
export const createManualManuscript = (text: string): ManuscriptData => {
  const cleanText = text.replace(/<[^>]*>/g, '\n').trim(); 
  const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
  
  const title = lines.length > 0 ? lines[0] : "Untitled Manuscript";
  const bodyContent = lines.slice(1).join('\n\n') || "Paste your manuscript content here...";

  const vol = "3";
  const issue = "1";
  const year = new Date().getFullYear().toString();
  const acceptedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

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
    volume: vol,
    issue: issue,
    year: year,
    pages: "1-12",
    receivedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    acceptedDate: acceptedDate,
    publishedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    figures: [],
    logoUrl: "https://raw.githubusercontent.com/stackblitz/stackblitz-images/main/jbsh-logo-placeholder.png",
    // LoA Defaults
    loaNumber: `JBSH/${year}/LOA/${Math.floor(Math.random() * 1000).toString().padStart(4, '0')}`,
    loaDate: acceptedDate,
    loaBody: generateLoaBody(title, vol, issue, year)
  };
};

export const parseManuscript = async (text: string): Promise<ManuscriptData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Prioritize Pro for quality, fallback to Flash
  const modelsToTry = ["gemini-3-pro-preview", "gemini-3-flash-preview"];

  const prompt = `
    You are an AI Assistant for the Journal of Biomedical Sciences and Health (JBSH).
    Convert the raw manuscript text below into a structured JSON object.

    Instructions:
    1. Organize the content into: Title, Authors, Abstract, Keywords, Sections (IMRAD), and References.
    2. Preserve the core content and paragraphs. 
    3. Fix obvious formatting issues (like line breaks in the middle of sentences).
    4. Remove page numbers or running headers.
    5. FORMULAS: If you encounter mathematical formulas or equations, keep them on their own separate line to ensure clear formatting.
    6. TABLES: If you detect data presented in rows and columns (either in text format or existing HTML tables), convert them into standard HTML <table> structures. Use <thead> for headers and <tbody> for the body. Ensure the table structure is clean.
    7. Ensure the Output is Valid JSON.

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

          const vol = "3";
          const issue = "1";
          const year = new Date().getFullYear().toString();
          const acceptedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

          return {
            ...parsed,
            doi: "10.xxxxx/jbsh.vX.iX.xxxx",
            volume: vol,
            issue: issue,
            year: year,
            pages: "1-12",
            receivedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            acceptedDate: acceptedDate,
            publishedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            figures: [],
            logoUrl: "https://raw.githubusercontent.com/stackblitz/stackblitz-images/main/jbsh-logo-placeholder.png",
            // LoA Defaults
            loaNumber: `JBSH/${year}/LOA/${Math.floor(Math.random() * 1000).toString().padStart(4, '0')}`,
            loaDate: acceptedDate,
            loaBody: generateLoaBody(parsed.title, vol, issue, year) 
          };
        }
        throw new Error("Empty response");

      } catch (error: any) {
        console.warn(`Attempt ${attempt} with ${modelName} failed:`, error);
        lastError = error;
        
        // Handle 503 (Server Overload) or 429 (Quota)
        if (error.message?.includes("503") || error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
          await sleep(2000); 
          continue;
        }
        break; // Break on other errors to try next model
      }
    }
  }
  
  throw new Error(lastError?.message || "AI processing failed. Please use Manual Mode.");
};
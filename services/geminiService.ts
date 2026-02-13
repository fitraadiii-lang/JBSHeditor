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

// --- JSON REPAIR UTILITY ---
// This is critical for preventing "unterminated string" errors when the AI output gets cut off.
const attemptJsonRepair = (jsonStr: string): string => {
  let repaired = jsonStr.trim();
  
  // 1. Fix Unclosed String (count quotes)
  let quoteCount = 0;
  let escape = false;
  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] === '\\' && !escape) { escape = true; continue; }
    if (repaired[i] === '"' && !escape) { quoteCount++; }
    escape = false;
  }
  
  if (quoteCount % 2 !== 0) {
      repaired += '"'; // Close the open string
  }

  // 2. Fix Unbalanced Braces/Brackets
  const stack: string[] = [];
  let inString = false;
  escape = false;

  for (let i = 0; i < repaired.length; i++) {
     const char = repaired[i];
     if (char === '\\' && !escape) { escape = true; continue; }
     
     if (char === '"' && !escape) { inString = !inString; }
     
     if (!inString && !escape) {
         if (char === '{') stack.push('}');
         if (char === '[') stack.push(']');
         if (char === '}' || char === ']') {
             if (stack.length > 0) {
                 const expected = stack[stack.length - 1];
                 if (char === expected) {
                     stack.pop();
                 }
             }
         }
     }
     escape = false;
  }
  
  // Append all missing closers
  while(stack.length > 0) {
      repaired += stack.pop();
  }
  
  return repaired;
};

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
  
  // PRIORITY: Flash first (Fast & High Quota), then Pro (Quality but Limited)
  // This solves the 429 error by defaulting to the "lighter" model first.
  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview"];

  const prompt = `
    You are an AI Assistant for the Journal of Biomedical Sciences and Health (JBSH).
    Convert the raw manuscript text below into a structured JSON object.

    Instructions:
    1. Organize the content into: Title, Authors, Abstract, Keywords, Sections (IMRAD), and References.
    2. Preserve the core content and paragraphs. 
    3. Fix obvious formatting issues (like line breaks in the middle of sentences).
    4. Remove page numbers or running headers.
    5. FORMULAS: If you encounter mathematical formulas or equations, keep them on their own separate line to ensure clear formatting.
    6. TABLES: If you detect data presented in rows and columns (either in text format or existing HTML tables), convert them into standard HTML <table> structures. Use <thead> for headers and <tbody> for the body.
    7. Ensure the Output is Valid JSON.

    Input Text:
    ${text}
  `;

  let lastError;

  for (const modelName of modelsToTry) {
    console.log(`Attempting parse with model: ${modelName}`);
    
    // Retry logic
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: manuscriptSchema,
            temperature: 0.1, 
            maxOutputTokens: 8192, 
          },
        });

        if (response.text) {
          let cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
          
          try {
              // ATTEMPT 1: Direct Parse
              const parsed = JSON.parse(cleanText) as ManuscriptData;
              return finalizeData(parsed);

          } catch (parseError) {
              console.warn(`JSON Parse failed for ${modelName}, attempting repair...`);
              
              // ATTEMPT 2: Repair Truncated JSON
              // This fixes the "unterminated string" error by auto-closing the JSON
              try {
                  const repairedText = attemptJsonRepair(cleanText);
                  const parsedRepaired = JSON.parse(repairedText) as ManuscriptData;
                  
                  // Fill missing required fields if cut off
                  if (!parsedRepaired.title) parsedRepaired.title = "Untitled (Recovered)";
                  if (!parsedRepaired.sections) parsedRepaired.sections = [{ heading: "Partial Content", content: "Content was truncated due to length. Please check the original doc." }];
                  if (!parsedRepaired.authors) parsedRepaired.authors = [{ name: "Unknown", affiliation: "Unknown" }];
                  if (!parsedRepaired.keywords) parsedRepaired.keywords = [];
                  if (!parsedRepaired.references) parsedRepaired.references = [];
                  if (!parsedRepaired.abstract) parsedRepaired.abstract = "Abstract not found or truncated.";

                  console.log("JSON Repair Successful!");
                  return finalizeData(parsedRepaired);
                  
              } catch (repairError) {
                  console.error("JSON Repair Failed:", repairError);
                  // Only throw if we have no other models to try
                  if (modelName === modelsToTry[modelsToTry.length - 1]) {
                       throw new Error("Manuscript is too long/complex for AI. Please try cutting it in half or use Manual Mode.");
                  }
              }
          }
        }
        if (!response.text && attempt === 2) throw new Error("Empty response from AI");

      } catch (error: any) {
        console.warn(`Attempt ${attempt} with ${modelName} failed:`, error.message);
        lastError = error;
        
        // Handle 429 (Quota)
        if (error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
          const waitTime = attempt * 2000;
          console.log(`Quota hit, waiting ${waitTime}ms...`);
          await sleep(waitTime); 
          continue; 
        }

        // Break to next model on non-retriable errors
        break; 
      }
    }
  }
  
  throw new Error(lastError?.message || "AI processing failed. Please use Manual Mode.");
};

// Helper to add metadata fields
const finalizeData = (parsed: ManuscriptData): ManuscriptData => {
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
    loaBody: generateLoaBody(parsed.title || "Untitled", vol, issue, year) 
    };
}
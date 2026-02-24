import { GoogleGenAI, Type } from "@google/genai";
import { ArticleData, Figure } from "../types";

const DEFAULT_MODEL = 'gemini-3-flash-preview';

const getAIInstance = (userKey?: string) => {
  const key = userKey || process.env.API_KEY || '';
  return new GoogleGenAI({ apiKey: key });
};

// Define an interface for the raw Gemini response structure
interface RawGeminiResponse {
  title?: string;
  articleType?: string;
  doi?: string; 
  abstract?: string;
  keywords?: string[];
  authors?: Array<{
    name: string;
    affiliation: string;
    email?: string;
    isCorresponding?: boolean;
  }>;
  contentSections?: Array<{
    header: string;
    body: string;
  }>;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const callGeminiWithRetry = async (fn: () => Promise<any>, retries = MAX_RETRIES): Promise<any> => {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('high demand');
    
    if (isRetryable && retries > 0) {
      const delay = INITIAL_RETRY_DELAY * (MAX_RETRIES - retries + 1);
      console.warn(`Gemini API busy (503). Retrying in ${delay}ms... (${retries} retries left)`);
      await sleep(delay);
      return callGeminiWithRetry(fn, retries - 1);
    }
    throw error;
  }
};

export const parseRawManuscript = async (
  rawText: string, 
  availableFigures: Figure[] = [], 
  articleType: string = 'Original Research Article',
  userKey?: string, 
  userModel?: string
): Promise<Partial<ArticleData>> => {
  const ai = getAIInstance(userKey);
  const modelName = userModel || DEFAULT_MODEL;

  // ... (figureContext and prompt logic remains same)
  const figureContext = availableFigures.length > 0 
    ? `The user has uploaded these figures: ${JSON.stringify(availableFigures.map(f => ({ id: f.id, name: f.name })))}. 
       IMPORTANT: You must scan the text for references to these figures (e.g., "Figure 1", "Fig. 1", "Figure 2"). 
       When you find a reference, insert the Markdown image code: ![Figure Name](figure-id) on a NEW LINE immediately after the paragraph that references it. 
       Use the EXACT IDs provided (e.g., figure-1, figure-2).`
    : "No figures have been uploaded yet. If figures are mentioned, ignore image insertion.";

  const prompt = `
    SYSTEM ROLE: You are a High-Fidelity Verbatim Extraction Engine for Biomedical Manuscripts.
    OBJECTIVE: Extract content from the provided manuscript into structured JSON with 100% TEXTUAL INTEGRITY.
    ARTICLE TYPE: ${articleType}

    *** CRITICAL INSTRUCTIONS: READ CAREFULLY ***
    1.  **NO SUMMARIZATION**: You are strictly FORBIDDEN from summarizing.
    2.  **NO REWRITING**: Do not change words or grammar. Copy text exactly as it appears.
    3.  **FULL EXTRACTION**: You must extract ALL relevant sections (e.g., Introduction, Methods, Results, Discussion, Conclusion, References) as they appear in the manuscript. The specific sections may vary based on the article type (e.g., Original Research, Narrative Review, Systematic Review).
    4.  **UNSTRUCTURED INPUT**: The input text might be missing newlines between titles, authors, and abstracts.
        - You must INTELLIGENTLY SPLIT this text.
        - The Title is usually the first sentence.
        - Authors follow the title.
        - Abstract follows authors.
        - Section Headers (INTRODUCTION, METHODS) are usually capitalized.

    **FORMATTING RULES:**
    1.  **Paragraphs**: Preserve paragraph breaks using double newlines (\\n\\n).
    2.  **Tables**: Convert all tables found in the text into valid Markdown Table syntax.
    3.  **Math**: Enclose equations in $$...$$ (block) or $...$ (inline) for LaTeX rendering.
    4.  **Figures**: ${figureContext}
    5.  **References**: Extract the full bibliography list as plain text.

    **INPUT TEXT:**
    (Provided below)
  `;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: modelName, 
      contents: [
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'user', parts: [{ text: rawText }] }
      ],
      config: {
        maxOutputTokens: 65536, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "EXTRACT VERBATIM. Do not Capitalize if not capitalized in source." },
            articleType: { type: Type.STRING, description: "Detect type (e.g. Original Research) or default." },
            doi: { type: Type.STRING, description: "Extract DOI if present (e.g. 10.34310/jbsh...). If not found, do NOT return 'null' string, return an empty string." }, 
            abstract: { type: Type.STRING, description: "EXTRACT VERBATIM. The full abstract text." },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            authors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  affiliation: { type: Type.STRING },
                  email: { type: Type.STRING, nullable: true },
                  isCorresponding: { type: Type.BOOLEAN, nullable: true }
                }
              }
            },
            contentSections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                   header: { type: Type.STRING, description: "The section header (e.g. '1. INTRODUCTION'). Copy exact numbering." },
                   body: { type: Type.STRING, description: "THE FULL VERBATIM CONTENT of this section in Markdown. Include ALL paragraphs, tables, and figure links." }
                }
              }
            }
          }
        }
      }
    }));

    if (response.text) {
      const json = JSON.parse(response.text) as RawGeminiResponse;
      
      // Clean up "null" strings that AI might return
      if (json.doi === "null") json.doi = "";
      if (json.title === "null") json.title = "";
      if (json.abstract === "null") json.abstract = "";
      
      let joinedContent = "";
      if (json.contentSections && Array.isArray(json.contentSections)) {
        joinedContent = json.contentSections
          .map(section => {
             const header = section.header.startsWith('#') ? section.header : `## ${section.header}`;
             return `${header}\n\n${section.body}`; 
          })
          .join('\n\n');
      }

      if (joinedContent) {
        joinedContent = joinedContent.replace(/\\n/g, '\n');
      }

      return {
        ...json,
        content: joinedContent 
      };
    }
    return {};
  } catch (error) {
    console.error("Error parsing manuscript with Gemini:", error);
    throw error;
  }
};

export const improveAbstract = async (
  abstract: string, 
  userKey?: string, 
  userModel?: string
): Promise<string> => {
  const ai = getAIInstance(userKey);
  const modelName = userModel || DEFAULT_MODEL;
  
  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: modelName,
    contents: `Rewrite the following abstract to be more concise, academic, and impactful for a high-impact biomedical journal. Ensure it has clear structure (Background, Methods, Results, Conclusion) but do not bold them in the output text, just write natural text. Keep it under 250 words.\n\n${abstract}`,
  }));
  
  return response.text || abstract;
};
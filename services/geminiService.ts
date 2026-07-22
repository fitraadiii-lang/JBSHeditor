import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ArticleData, Figure } from "../types";

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';

const getAIInstance = (userKey?: string) => {
  let envKey = '';
  try {
    // @ts-ignore
    envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : '';
  } catch (e) {}
  const key = userKey || envKey || '';
  if (!key) {
    throw new Error("API key is required. Please enter it in the AI Configuration tab.");
  }
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
    You are a strictly constrained Data Extraction Engine for Biomedical Manuscripts.
    Your SOLE objective is to format the provided INPUT TEXT into structured Markdown. 
    YOU MUST NOT SUMMARIZE. YOU MUST NOT MAKE UP TEXT. YOU MUST TRANSCRIBE THE PROVIDED INPUT TEXT VERBATIM.

    *** CRITICAL INSTRUCTIONS: READ CAREFULLY ***
    1.  **NO SUMMARIZATION (SANGAT KETAT)**: You are strictly FORBIDDEN from summarizing, modifying, or reducing any substantive content. You are a precise copy-paste formatting tool.
    2.  **ZERO DATA LOSS**: Ensure that NO paragraphs, sentences, or data points from the INPUT TEXT are left out. The output body must contain 100% of the original manuscript text.
    3.  **FULL EXTRACTION**: You must extract ALL sections from start to finish from the INPUT TEXT (Introduction, Methods, Results, Discussion, Conclusion, References). YOU MUST CONTINUE TRANSCRIBING UNTIL THE VERY END OF THE INPUT TEXT.
    4.  **IGNORE PDF ARTIFACTS**: Exclude page numbers, running headers, and footers (e.g., journal names, 'Halaman 1-8').
    5.  **FORMATTING RULES**:
        - Apply Markdown headers (#, ##, ###) for sections.
        - Preserve paragraph breaks using double newlines.
        - Format biological species names in italics (e.g., *Staphylococcus aureus*).
        - Format Data Tables as Markdown tables.
    6.  **Figures**: ${figureContext}

    **OUTPUT FORMAT**:
    ===TITLE===
    [Extract title here from INPUT TEXT]
    ===ARTICLE_TYPE===
    [Extract article type here from INPUT TEXT]
    ===DOI===
    [Extract DOI here from INPUT TEXT]
    ===ABSTRACT===
    [Extract abstract here from INPUT TEXT]
    ===KEYWORDS===
    [Comma separated keywords from INPUT TEXT]
    ===AUTHORS===
    [Name | Affiliation | Email | true/false]
    ===CONTENT===
    (STARTING FROM THE INTRODUCTION OF THE INPUT TEXT, COPY PASTE THE ENTIRE REMAINING MANUSCRIPT TEXT HERE. DO NOT STOP UNTIL THE LAST WORD OF THE REFERENCES. YOU MUST WRITE EVERY SINGLE WORD AND PARAGRAPH FROM THE INPUT TEXT.)
  `;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: modelName, 
      contents: `**INPUT TEXT:**\n${rawText}`,
      config: {
        systemInstruction: prompt,
        maxOutputTokens: 8192,
        temperature: 0.0,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      }
    }));

    if (response.text) {
      const text = response.text;
      
      const extractSection = (tag: string, nextTag?: string) => {
        const start = text.indexOf(`===${tag}===`);
        if (start === -1) return "";
        const end = nextTag ? text.indexOf(`===${nextTag}===`, start) : text.length;
        if (end === -1) return text.substring(start + `===${tag}===`.length).trim();
        return text.substring(start + `===${tag}===`.length, end).trim();
      };

      const title = extractSection("TITLE", "ARTICLE_TYPE");
      const articleTypeOut = extractSection("ARTICLE_TYPE", "DOI");
      const doi = extractSection("DOI", "ABSTRACT");
      const abstract = extractSection("ABSTRACT", "KEYWORDS");
      const keywordsRaw = extractSection("KEYWORDS", "AUTHORS");
      const authorsRaw = extractSection("AUTHORS", "CONTENT");
      const content = extractSection("CONTENT");

      const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(k => k);
      
      const authors = authorsRaw.split('\n').map(line => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length < 2) return null;
        return {
          name: parts[0] || '',
          affiliation: parts[1] || '',
          email: parts[2] !== 'undefined' ? parts[2] : undefined,
          isCorresponding: parts[3] === 'true'
        };
      }).filter(Boolean) as Array<{
        name: string;
        affiliation: string;
        email?: string;
        isCorresponding?: boolean;
      }>;

      return {
        title: title === "null" ? "" : title,
        articleType: articleTypeOut,
        doi: doi === "null" ? "" : doi,
        abstract: abstract === "null" ? "" : abstract,
        keywords,
        authors,
        content: content ? content.replace(/\\n/g, '\n') : ""
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
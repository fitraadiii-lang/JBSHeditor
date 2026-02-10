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
    content: { type: Type.STRING, description: "The FULL body text of the section. MUST BE WORD-FOR-WORD IDENTICAL to the input. Do not skip a single sentence." },
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

export const parseManuscript = async (text: string): Promise<ManuscriptData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // PENTING: Prompt ini dibuat sangat agresif agar AI tidak "malas" atau meringkas.
  const prompt = `
    TASK: Convert the raw manuscript text into a structured JSON object exactly.
    
    CRITICAL INSTRUCTION: **DATA INTEGRITY IS PARAMOUNT.**
    
    1. **VERBATIM COPYING**: You are acting as a Data Extractor, NOT an Editor.
       - Do NOT summarize.
       - Do NOT correct grammar.
       - Do NOT fix typos.
       - Do NOT improve the writing style.
       - COPY every single paragraph from Introduction, Methods, Results, Discussion, and Conclusion EXACTLY as they appear.

    2. **HANDLING LENGTH**: The input text is long. Do not truncate the output. If a section (e.g., Discussion) is 1000 words, your output for that section MUST be 1000 words.
    
    3. **HTML PRESERVATION**: If you see HTML tables (<table>) or specific formatting, keep them.

    4. **CLEANING**: The ONLY thing you are allowed to remove are artifacts like:
       - "Page 1 of 12"
       - Repeated journal headers/footers.
       - "Insert Figure X Here" placeholders (ONLY if you are sure they are placeholders).
    
    INPUT TEXT START:
    ${text}
    INPUT TEXT END
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: manuscriptSchema,
        // Temperature 0 forces the model to be deterministic and non-creative (prevents hallucination/rewriting)
        temperature: 0,
        // High token limit to ensure full manuscript generation
        maxOutputTokens: 8192, 
        systemInstruction: "You are a specialized Copy-Paste Engine. Your goal is 100% text match. If the input has 2000 words, the output must have 2000 words. Do not shorten any section.",
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text) as ManuscriptData;
      
      // Post-processing to ensure data validity
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
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    throw new Error("Failed to parse manuscript. Please try again or check if the file text is readable.");
  }
};
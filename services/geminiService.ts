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
    content: { type: Type.STRING, description: "The FULL body text/HTML of the section. Keep all paragraphs and TABLES (<table>...</table>) intact. Do not summarize." },
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

  const prompt = `
    You are a strict Document Parser and Formatter for the journal 'JBSH'.
    Your ONLY task is to structure the raw manuscript into JSON.
    
    CRITICAL RULES FOR CONTENT PRESERVATION (STRICT VERBATIM MODE):
    1. **NO SUMMARIZATION**: You are FORBIDDEN from shortening any text.
    2. **NO EDITING**: Do not fix grammar, do not improve style, do not remove redundancy. Copy the text EXACTLY as it appears in the body paragraphs.
    3. **PRESERVE HTML**: If the input contains HTML tables (<table>), YOU MUST PRESERVE THEM EXACTLY.
    4. **CLEAN NOISE ONLY**: Only remove obvious artifacts like page numbers ("Page 1 of 5"), running heads, or "Insert Figure 1 Here" placeholders. Do NOT remove actual content sentences.
    
    Structure Requirements:
    - Extract Title, Authors (with affiliations), Abstract, and Keywords.
    - Organize body text into Sections (Introduction, Methods, Results, Discussion, Conclusion).
    - Extract References list formatted strictly in APA 7th style.

    Raw Manuscript Content:
    ${text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: manuscriptSchema,
        systemInstruction: "You are a robotic parser. Your goal is 100% data fidelity. Output the input text word-for-word into the correct JSON fields. Do not act as an editor.",
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text) as ManuscriptData;
      // Add default metadata for JBSH if missing
      return {
        ...parsed,
        doi: "10.xxxxx/jbsh.vX.iX.xxxx",
        volume: "1",
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
    throw new Error("Failed to parse manuscript. The file might be too large for the output limit, or the format is unrecognized.");
  }
};
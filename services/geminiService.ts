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
    You are an expert academic editor for the journal 'JBSH' (Journal of Biomedical Sciences and Health).
    Your task is to take the following raw manuscript (which may contain HTML tags) and structure it into a JSON format suitable for a professional academic journal publication.
    
    CRITICAL INSTRUCTION: 
    1. DO NOT SUMMARIZE. You must retain the FULL content of the manuscript sections. Output all paragraphs exactly as provided.
    2. **TABLES**: If the input contains HTML tables (<table>), YOU MUST PRESERVE THEM EXACTLY in the 'content' field. Do not convert them to text. We need the HTML structure for formatting.
    3. Extract the Title, Authors (with affiliations), Abstract, and Keywords.
    4. Identify the main sections (Introduction, Literature Review, Methods, Results, Discussion, Conclusion).
    5. Clean the text content. Remove page numbers, running heads, or artifacts from the raw file.
    6. Extract the references list. Format each reference string strictly according to APA 7th Edition style (e.g., Author, A. A. (Year). Title. Source.).

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
        systemInstruction: "You are a precise document parser. Your input is converted HTML. You must output clean HTML in the content fields where applicable (especially for tables).",
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
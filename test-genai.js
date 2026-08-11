import { GoogleGenAI } from "@google/genai";
import fs from "fs";

async function run() {
    const ai = new GoogleGenAI({ apiKey: "invalid_key" });
    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: [
                { role: "user", parts: [{ text: "Hello" }] }
            ]
        });
        console.log("Success (unexpected)", response);
    } catch(e) {
        console.log("ERROR 1:", e.status, e.message);
    }

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: "Hello"
        });
        console.log("Success (unexpected)", response);
    } catch(e) {
        console.log("ERROR 2:", e.status, e.message);
    }
}
run().catch(console.error);

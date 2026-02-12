
import { GoogleGenAI } from "@google/genai";
import { 
    rpsTemplate, rtmHeader, rtmFooter, rtmTaskSection, rtmRubricWriting, rtmRubricOral, rtmRubricProject, 
    modulTemplate, pptTemplate, kontrakTemplate, portofolioTemplate, blueprintTemplate 
} from './templates';

const MODEL_NAME = 'gemini-3-flash-preview';
// MENGUBAH MODEL DARI PRO KE FLASH AGAR KUOTA LEBIH BANYAK (MENGHINDARI LIMIT 429)
const REASONING_MODEL = 'gemini-3-flash-preview'; 

const getAI = () => {
    // FIX: Menggunakan import.meta.env untuk Vite/Cloudflare Pages
    const env = (import.meta as any).env || {};
    
    // Prioritas: VITE_GOOGLE_API_KEY -> VITE_API_KEY -> Hardcoded
    const apiKey = env.VITE_GOOGLE_API_KEY || env.VITE_API_KEY || "AIzaSyAFbjHiHeMQMoRdKx_u8u3K354cSf0no_E";

    if (apiKey) {
        return new GoogleGenAI({ apiKey: apiKey });
    }
    
    console.error("API Key not found.");
    return null;
};

const cleanJsonString = (text: string) => {
    if (!text) return "";
    let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return clean;
};

export const generateChatResponse = async (history: {role: string, text: string}[], lastMessage: string): Promise<string> => {
    const ai = getAI();
    if (!ai) return "Error: API Key missing.";

    try {
        const contents = history.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.text }]
        }));
        
        const lastInHistory = history[history.length - 1];
        if (!lastInHistory || lastInHistory.text !== lastMessage) {
            contents.push({ role: 'user', parts: [{ text: lastMessage }] });
        }

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: contents,
            config: {
                systemInstruction: "Anda adalah Asisten Dosen untuk Sistem SICANTIK YAHOED. Jawab dengan ramah, singkat, dan membantu terkait administrasi perkuliahan.",
            }
        });
        return response.text || "Maaf, saya tidak dapat menjawab saat ini.";
    } catch (e) {
        console.error(e);
        return "Terjadi kesalahan koneksi AI.";
    }
};

export const parseSubjectDetails = async (text: string) => {
    const ai = getAI();
    if (!ai) return null;

    const prompt = `
    Analisis teks berikut dari dokumen akademik.
    Ekstrak JSON:
    {
        "name": "Nama Mata Kuliah", "code": "Kode MK", "semester": 1, "sks_t": 2, "sks_p": 1,
        "tahun_ajaran": "2025/2026", "koordinator": "Nama", "cpl": "...", "cpmk": "..."
    }
    Teks: ${text.substring(0, 10000)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(cleanJsonString(response.text || "{}"));
    } catch (e) {
        console.error("Parse Subject Error", e);
        return null;
    }
};

export const parseProdiProfile = async (text: string) => {
    const ai = getAI();
    if (!ai) return null;

    const prompt = `
    Analisis profil prodi. Ekstrak JSON:
    { "visi": "...", "misi": "...", "desc": "...", "cpl_prodi": "..." }
    Teks: ${text.substring(0, 10000)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(cleanJsonString(response.text || "{}"));
    } catch (e) {
        console.error("Parse Prodi Error", e);
        return null;
    }
};

export const generateDocument = async (docType: string, subjectName: string, context: string, options: any): Promise<string | null> => {
    const ai = getAI();
    if (!ai) return null;

    let userPrompt = `CONTEXT:\n${context}\n\nBUAT DOKUMEN ${docType} lengkap.`;

    // Prompt Logic Sederhana
    if (docType === 'RPS') {
        userPrompt += ` Output JSON valid untuk Template RPS: { "NAMA_MK": "...", "KODE_MK": "...", "TBODY_MINGGUAN": "HTML rows...", ... }`;
    } else if (docType === 'MODUL') {
        userPrompt += ` Output JSON valid untuk Template MODUL: { "CONTENT_MODULES": "HTML content..." }`;
    } else if (docType === 'KONTRAK') {
        userPrompt += ` Output JSON valid untuk Template KONTRAK.`;
    } else if (docType === 'PORTOFOLIO') {
        userPrompt += ` Output JSON valid untuk Template PORTOFOLIO.`;
    } else if (docType === 'BLUEPRINT') {
         userPrompt += ` Output JSON valid untuk Template BLUEPRINT: { "MATRIKS_ROWS": "HTML rows..." }`;
    } else if (docType === 'RTM') {
         userPrompt = `${context}\n\nTugas: Buat RTM (Rencana Tugas Mahasiswa). Jumlah: ${options.count}. Jenis: ${options.types?.join(', ')}.\nOutput: SATU string HTML lengkap (isi body saja) sesuai template berikut:\n${rtmTaskSection}\nSertakan rubrik yang sesuai.`;
    }

    try {
        const response = await ai.models.generateContent({
            model: REASONING_MODEL,
            contents: userPrompt,
            config: {
                responseMimeType: docType === 'RTM' ? "text/plain" : "application/json"
            }
        });

        const resultText = response.text || "";

        if (docType === 'RTM') return rtmHeader + resultText + rtmFooter;
        
        const data = JSON.parse(cleanJsonString(resultText));
        let template = "";
        switch (docType) {
            case 'RPS': template = rpsTemplate; break;
            case 'MODUL': template = modulTemplate; break;
            case 'KONTRAK': template = kontrakTemplate; break;
            case 'PORTOFOLIO': template = portofolioTemplate; break;
            case 'BLUEPRINT': template = blueprintTemplate; break;
            default: return "Template not found";
        }

        let filledHtml = template;
        for (const [key, value] of Object.entries(data)) {
            filledHtml = filledHtml.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        }
        return filledHtml;

    } catch (e) {
        console.error(`${docType} Gen Error`, e);
        return null;
    }
};

export const generateExamQuestions = async (blueprintContext: string, config: any) => {
    const ai = getAI();
    if (!ai) return null;

    const prompt = `
    Blueprint: ${blueprintContext}
    Materi: ${config.materialText || "-"}
    Buat Bank Soal (${config.examType}) untuk ${config.subjectName}.
    Jenis: ${config.type}. Jumlah: ${config.pgCount} PG, ${config.essayCount} Essay.
    Output JSON: { "student_doc": "HTML...", "admin_doc": "HTML w/ Key...", "integrated_doc": "HTML Table..." }
    `;

    try {
        const response = await ai.models.generateContent({
            model: REASONING_MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const data = JSON.parse(cleanJsonString(response.text || "{}"));
        const wrap = (body: string) => `<html><body><div style="padding: 20px; font-family: Arial;">${body}</div></body></html>`;
        return { student: wrap(data.student_doc), admin: wrap(data.admin_doc), integrated: wrap(data.integrated_doc) };
    } catch (e) {
        console.error("Exam Gen Error", e);
        return null;
    }
};

export const generatePresentation = async (moduleText: string, meetingInfo: string, slideCount: number | string, selectedTopics?: string[]): Promise<string | null> => {
    const ai = getAI();
    if (!ai) return null;
    
    // Simplifikasi prompt untuk kejelasan
    const prompt = `
    Buat struktur JSON slide presentasi (PPT) dari materi berikut:
    ${moduleText.substring(0, 30000)}
    
    Instruksi: ${slideCount === 'Auto' ? 'Optimalkan jumlah slide.' : `Buat ${slideCount} slide.`}
    ${selectedTopics ? `Fokus topik: ${selectedTopics.join(', ')}` : ''}

    Output JSON Format: { "slides": [{ "layout": "TITLE|AGENDA|CONTENT|CONCLUSION|REFERENCES", "title": "...", "items": [], "figure": "..." }] }
    `;

    try {
        const response = await ai.models.generateContent({
            model: REASONING_MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return cleanJsonString(response.text || "");
    } catch (e) {
        console.error("PPT Gen Error", e);
        return null;
    }
};

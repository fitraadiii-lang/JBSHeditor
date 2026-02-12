import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ManuscriptData, AppState, ManuscriptFigure } from './types';
import { parseManuscript, createManualManuscript } from './services/geminiService';
import { LayoutPreview } from './components/LayoutPreview';
import { LoaTemplate } from './components/LoaTemplate';
import { Upload, FileText, Printer, ChevronLeft, RefreshCw, AlertCircle, ArrowRight, Image as ImageIcon, Plus, Trash2, FileDown, Edit, Check, Save, LogIn, User, LogOut, Home, FileSearch, Info, AlertTriangle, CheckCircle, SearchX, ZapOff, FileSignature, Mail, Settings, X, Send, Layout, FileType, ExternalLink } from 'lucide-react';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, SectionType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType, Header, Footer, PageNumber, VerticalAlign } from "docx";
import FileSaver from "file-saver";
import emailjs from '@emailjs/browser';

// Default JBSH Logo from user request
const DEFAULT_LOGO_URL = "https://i.ibb.co.com/84Q0yL5/jbsh-logo.jpg";
// Unlock icon for DOCX generation (Open Access Box)
const UNLOCK_ICON_URL = "https://img.icons8.com/ios-glyphs/60/737373/unlock.png";

// --- EMAILJS CONFIGURATION ---
// Masukkan kredensial EmailJS Anda di sini
const EMAIL_DEFAULTS = {
    SERVICE_ID: "service_l0d7noh", // Service ID
    TEMPLATE_ID: "template_dy9hdom", // Template ID yang baru
    PUBLIC_KEY: "BBQB5tdjg4Hjlc-KZ"   // Public Key yang baru
};

// --- AUTHENTICATION CONFIG ---
const ALLOWED_EMAILS = [
  "fitraadi@unkaha.ac.id",
  "jbsh@unkaha.ac.id",
  "poppy@stikesyahoedsmg.ac.id"
];
const MASTER_PASSWORD = "jbshunkaha";

declare global {
  interface Window {
    html2pdf: any;
  }
}

interface ValidationStats {
    originalWordCount: number;
    generatedWordCount: number;
    coveragePercent: number; // How many unique words from original exist in generated
    status: 'success' | 'warning' | 'danger';
    missingSections: string[];
    formattingIssues: string[]; // Writing errors/formatting issues
}

interface EmailConfig {
    serviceId: string;
    templateId: string;
    publicKey: string;
}

const App: React.FC = () => {
  // Start at LOGIN state
  const [appState, setAppState] = useState<AppState>(AppState.LOGIN);
  const [previewTab, setPreviewTab] = useState<'manuscript' | 'loa'>('manuscript');
  const [manuscriptData, setManuscriptData] = useState<ManuscriptData | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [validationStats, setValidationStats] = useState<ValidationStats | null>(null);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  
  // Email Config State (Persisted in localStorage for convenience)
  // Use EMAIL_DEFAULTS if localStorage is empty
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
      serviceId: localStorage.getItem('jbsh_email_service_id') || EMAIL_DEFAULTS.SERVICE_ID,
      templateId: localStorage.getItem('jbsh_email_template_id') || EMAIL_DEFAULTS.TEMPLATE_ID,
      publicKey: localStorage.getItem('jbsh_email_public_key') || EMAIL_DEFAULTS.PUBLIC_KEY
  });

  // Auth State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [currentUser, setCurrentUser] = useState<string>("");

  // New State for Figure Upload inputs
  const [newFigCaption, setNewFigCaption] = useState("");

  // --- UTILS ---
  const toTitleCase = (str: string) => {
    if (!str) return "";
    return str.replace(
      /\w\S*/g,
      text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
  };

  const saveEmailConfig = () => {
      localStorage.setItem('jbsh_email_service_id', emailConfig.serviceId);
      localStorage.setItem('jbsh_email_template_id', emailConfig.templateId);
      localStorage.setItem('jbsh_email_public_key', emailConfig.publicKey);
      setShowEmailSettings(false);
      alert("Email configuration saved!");
  };

  // --- AUTH HANDLERS ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ALLOWED_EMAILS.includes(loginEmail.trim())) {
      setError("Access Denied: Email not authorized.");
      return;
    }

    if (loginPassword !== MASTER_PASSWORD) {
      setError("Access Denied: Incorrect password.");
      return;
    }

    // Success
    setCurrentUser(loginEmail);
    setAppState(AppState.UPLOAD);
    setPreviewTab('manuscript'); // Reset tab
    setError(null);
  };

  const handleLogout = () => {
    setAppState(AppState.LOGIN);
    setManuscriptData(null);
    setRawText("");
    setCurrentUser("");
    setLoginEmail("");
    setLoginPassword("");
  };

  const handleGoHome = () => {
      setAppState(AppState.UPLOAD);
      setManuscriptData(null);
      setRawText("");
      setError(null);
      setValidationStats(null);
      setPreviewTab('manuscript');
  };

  // --- VALIDATION LOGIC ---
  const runValidation = (original: string, generated: ManuscriptData) => {
      // Helper to clean text and get words array for accurate comparison
      const getWords = (text: string) => {
          return text
            .replace(/<[^>]*>/g, ' ') // Strip HTML tags
            .replace(/\[FIGURE REMOVED\]/g, ' ') // Ignore placeholders
            .replace(/&nbsp;/g, ' ')
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ') // Collapse whitespace
            .trim()
            .toLowerCase()
            .split(' ')
            .filter(w => w.length > 2); // Ignore very short words like 'at', 'in'
      };

      const originalWords = getWords(original);
      
      // Combine all generated text
      const generatedContent = [
          generated.title,
          generated.abstract,
          ...generated.keywords,
          ...generated.sections.map(s => s.content),
          ...generated.references
      ].join(' ');
      
      const generatedWords = getWords(generatedContent);
      const generatedWordSet = new Set(generatedWords);

      // 2. Metrics
      const origCount = originalWords.length;
      const genCount = generatedWords.length;

      // 3. Keyword Coverage (Intersection)
      // Check how many words from the ORIGINAL exist in the GENERATED
      let foundCount = 0;
      originalWords.forEach(w => {
          if (generatedWordSet.has(w)) foundCount++;
      });
      
      // Calculate percentage based on original words found
      const coverage = origCount > 0 
        ? Math.round((foundCount / origCount) * 100) 
        : 0;
      
      // Allow some leeway (e.g., cleaned artifacts, running heads) - Cap at 100%
      const adjustedCoverage = Math.min(100, coverage); 

      // 4. Missing Structure Check
      const requiredSections = ['Introduction', 'Method', 'Result', 'Discussion', 'Conclusion'];
      const currentHeadings = generated.sections.map(s => s.heading.toLowerCase());
      const missingSections = requiredSections.filter(req => 
          !currentHeadings.some(h => h.includes(req.toLowerCase()))
      );

      // 5. Formatting Issues
      const formattingIssues: string[] = [];
      if (generatedContent.includes("Error! Reference source not found")) {
          formattingIssues.push("Found 'Error! Reference source' artifact.");
      }
      if (/\[\s*(?:insert|figure|table).*\]/i.test(generatedContent)) {
          formattingIssues.push("Potential placeholder text detected.");
      }

      // 6. Determine Status
      let status: 'success' | 'warning' | 'danger' = 'success';
      // Thresholds: Danger if < 80%, Warning if < 95%
      if (adjustedCoverage < 80 || genCount < origCount * 0.7 || missingSections.length > 2) status = 'danger';
      else if (adjustedCoverage < 95 || genCount < origCount * 0.9 || missingSections.length > 0 || formattingIssues.length > 0) status = 'warning';

      setValidationStats({
          originalWordCount: origCount,
          generatedWordCount: genCount,
          coveragePercent: adjustedCoverage,
          status,
          missingSections,
          formattingIssues
      });
  };

  // Helper to read file content
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.docx')) {
       const reader = new FileReader();
       reader.onload = async (e) => {
         const arrayBuffer = e.target?.result as ArrayBuffer;
         try {
           const result = await mammoth.convertToHtml({ arrayBuffer });
           const fullHtml = result.value;
           
           const extractedFigures: ManuscriptFigure[] = [];
           const parser = new DOMParser();
           const doc = parser.parseFromString(fullHtml, 'text/html');
           const imgs = doc.querySelectorAll('img');
           
           imgs.forEach((img, index) => {
               const src = img.getAttribute('src');
               if(src && src.startsWith('data:image')) {
                   extractedFigures.push({
                       id: (index + 1).toString(),
                       fileUrl: src,
                       caption: `Figure ${index + 1} (Extracted from source)`
                   });
               }
           });

           const cleanHtmlForAI = fullHtml.replace(/<img[^>]*>/g, '[FIGURE REMOVED]');
           setRawText(cleanHtmlForAI);
           processManuscript(cleanHtmlForAI, extractedFigures);

         } catch (err) {
           console.error(err);
           setError("Failed to read DOCX file. Is it corrupted?");
         }
       };
       reader.readAsArrayBuffer(file);
    } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
       const reader = new FileReader();
       reader.onload = async (e) => {
         const text = e.target?.result as string;
         const extractedFigures: ManuscriptFigure[] = [];
         try {
             const parser = new DOMParser();
             const doc = parser.parseFromString(text, 'text/html');
             const imgs = doc.querySelectorAll('img');
             imgs.forEach((img, index) => {
                 const src = img.getAttribute('src');
                 if(src && src.startsWith('data:image')) {
                     extractedFigures.push({
                         id: (index + 1).toString(),
                         fileUrl: src,
                         caption: `Figure ${index + 1}`
                     });
                 }
             });
         } catch(e) { console.warn("Failed to extract images from HTML", e); }

         const cleanHtmlForAI = text.replace(/<img[^>]*>/g, '[FIGURE REMOVED]');
         setRawText(cleanHtmlForAI);
         processManuscript(cleanHtmlForAI, extractedFigures);
       };
       reader.readAsText(file);
    } else {
       const reader = new FileReader();
       reader.onload = async (e) => {
         const text = e.target?.result as string;
         setRawText(text);
         processManuscript(text);
       };
       reader.readAsText(file);
    }
  };

  const handleManualText = () => {
      if (rawText.trim().length < 20) {
          setError("Text is too short. Please paste the full manuscript.");
          return;
      }
      processManuscript(rawText);
  }

  const handleManualProcessing = () => {
     if (rawText.trim().length < 1) {
         setError("Please paste or upload content first.");
         return;
     }
     setError(null);
     setAppState(AppState.PROCESSING);
     // Simulate slight delay for UI feel
     setTimeout(() => {
         const data = createManualManuscript(rawText);
         if (!data.logoUrl || data.logoUrl.includes('placeholder')) {
             data.logoUrl = DEFAULT_LOGO_URL;
         }
         // Set validation stats to 'Manual' (100% implicitly)
         setValidationStats({
             originalWordCount: rawText.split(' ').length,
             generatedWordCount: rawText.split(' ').length,
             coveragePercent: 100,
             status: 'success',
             missingSections: [],
             formattingIssues: ["Manual Mode Active - Please organize content manually"]
         });
         setManuscriptData(data);
         setAppState(AppState.METADATA_REVIEW);
     }, 800);
  };

  const processManuscript = async (text: string, initialFigures: ManuscriptFigure[] = []) => {
    setAppState(AppState.PROCESSING);
    setError(null);
    setValidationStats(null);
    try {
      const data = await parseManuscript(text);
      
      if (!data.logoUrl || data.logoUrl.includes('placeholder')) {
         data.logoUrl = DEFAULT_LOGO_URL;
      }
      
      data.title = toTitleCase(data.title);

      if (initialFigures.length > 0) {
          data.figures = initialFigures;
      } else if (!data.figures) {
          data.figures = [];
      }

      runValidation(text, data);

      setManuscriptData(data);
      setAppState(AppState.METADATA_REVIEW);
    } catch (err: any) {
      setError(err.message || "Failed to process manuscript");
      setAppState(AppState.UPLOAD);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
      if (!manuscriptData) return;
      setIsDownloading(true);

      const element = document.getElementById('printable-content');
      
      const opt = {
        margin: 0,
        filename: `JBSH_${manuscriptData.year}_${manuscriptData.authors[0]?.name.split(' ').pop()}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { 
            scale: 2, 
            useCORS: true,
            letterRendering: true
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      if (window.html2pdf) {
        window.html2pdf().set(opt).from(element).save().then(() => {
            setIsDownloading(false);
        });
      } else {
          alert("PDF generator library not loaded correctly.");
          setIsDownloading(false);
      }
  };

  const getLoAPDFBlob = async (): Promise<Blob | null> => {
      // Logic: If we are in "LoA" preview mode, we can capture the visible preview.
      // But if we are in "Manuscript" mode, we must use the hidden template.
      // To ensure consistent behavior, we will ALWAYS use the hidden template for generation.
      // The hidden template is updated by React whenever `manuscriptData` changes.
      const element = document.getElementById('loa-hidden-template');
      if (!element || !window.html2pdf) return null;

      // Ensure margin fixes are applied during capture
      const opt = {
        margin: 0, 
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true,
            letterRendering: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794 // Force A4 Width in pixels
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      try {
          const pdfObject = await window.html2pdf().set(opt).from(element).toPdf().get('pdf');
          const pdfBlob = pdfObject.output('blob');
          return pdfBlob;
      } catch (e) {
          console.error("PDF generation error:", e);
          return null;
      }
  };

  const handleDownloadLoA = () => {
      if (!manuscriptData) return;
      setIsDownloading(true);

      const element = document.getElementById('loa-hidden-template');
      
      const opt = {
        margin: 0, 
        filename: `LoA_JBSH_${manuscriptData.authors[0]?.name.split(' ').pop()}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { 
            scale: 2, 
            useCORS: true,
            letterRendering: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794 // 210mm @ 96 DPI
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      if (window.html2pdf) {
        window.html2pdf().set(opt).from(element).save().then(() => {
            setIsDownloading(false);
        });
      } else {
          alert("PDF generator library not loaded correctly.");
          setIsDownloading(false);
      }
  };

  const handleEmailLoA = async () => {
    if (!manuscriptData) return;
    
    // Check if EmailJS is configured
    if (!emailConfig.serviceId || !emailConfig.publicKey || !emailConfig.templateId) {
        // Fallback to Mailto with instructions
        const confirmSetup = window.confirm(
            "EmailJS is not configured. To send emails automatically with attachments, you need to set up the keys in Settings.\n\nDo you want to use the default email client (manual attachment) instead?"
        );
        
        if (confirmSetup) {
             // 1. Download File
             handleDownloadLoA();

             // 2. Open Mailto
            const authorName = manuscriptData.authors[0].name;
            const authorEmail = manuscriptData.authors.find(a => a.email)?.email || ""; 
            const subject = `Letter of Acceptance - ${manuscriptData.title}`;
            const body = `Dear ${authorName},\n\nWe are pleased to inform you that your manuscript titled "${manuscriptData.title}" has been ACCEPTED for publication in JBSH.\n\nPlease find the attached Letter of Acceptance.\n\nSincerely,\nJBSH Editor`;
            
            setTimeout(() => {
                window.location.href = `mailto:${authorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            }, 1000);
        } else {
            setShowEmailSettings(true);
        }
        return;
    }

    setIsSendingEmail(true);

    try {
        // 1. Generate PDF Blob
        const pdfBlob = await getLoAPDFBlob();
        if (!pdfBlob) throw new Error("Failed to generate PDF");

        // 2. Convert to Base64 (Data URI)
        const reader = new FileReader();
        reader.readAsDataURL(pdfBlob);
        reader.onloadend = async () => {
            const base64data = reader.result as string; 
            
            // 3. Prepare Template Params (Must match your EmailJS Template)
            const templateParams = {
                to_email: manuscriptData.authors.find(a => a.email)?.email || "",
                to_name: manuscriptData.authors[0].name,
                article_title: manuscriptData.title,
                loa_attachment: base64data // Requires template to have an attachment field mapped to this
            };

            // 4. Send via EmailJS
            try {
                await emailjs.send(
                    emailConfig.serviceId, 
                    emailConfig.templateId, 
                    templateParams, 
                    emailConfig.publicKey
                );
                alert(`Email sent successfully to ${templateParams.to_email}!`);
            } catch (err: any) {
                console.error("EmailJS Error:", err);
                
                // --- HANDLING FILE SIZE LIMIT (413) ---
                // If file is too big for free tier, fallback to Manual mode gracefully
                if (err.status === 413 || (err.text && err.text.includes("size limit"))) {
                    const proceed = window.confirm(
                        "File is too large for the free email server (Limit 50KB).\n\nSwitching to manual mode:\n1. The PDF will be downloaded automatically.\n2. Your email app will open.\n3. Simply attach the downloaded file and send.\n\nProceed?"
                    );
                    if (proceed) {
                         // Download
                         FileSaver.saveAs(pdfBlob, `LoA_JBSH_${manuscriptData.authors[0]?.name.split(' ').pop()}.pdf`);
                         
                         // Mailto
                         const subject = `Letter of Acceptance - ${manuscriptData.title}`;
                         const body = `Dear ${templateParams.to_name},\n\nWe are pleased to inform you that your manuscript titled "${manuscriptData.title}" has been ACCEPTED for publication in JBSH.\n\nPlease find the attached Letter of Acceptance.\n\nSincerely,\nJBSH Editor`;
                         window.location.href = `mailto:${templateParams.to_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    }
                } else {
                    alert("Failed to send email.\n\nError: " + JSON.stringify(err));
                }
            } finally {
                setIsSendingEmail(false);
            }
        };

    } catch (e) {
        console.error("Sending failed", e);
        alert("An error occurred while preparing the email.");
        setIsSendingEmail(false);
    }
  };

  const getImageBuffer = async (url: string): Promise<{ data: ArrayBuffer }> => {
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          const data = await blob.arrayBuffer();
          return { data };
      } catch (e) {
          console.error("Failed to fetch image for docx", e);
          throw new Error("Image fetch failed");
      }
  };

  const stripHtmlToText = (html: string) => {
    let text = html;
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n'); 
    text = text.replace(/<\/tr>/gi, '\n'); 
    text = text.replace(/<\/td>/gi, '\t');
    text = text.replace(/<\/th>/gi, '\t');
    text = text.replace(/<[^>]+>/g, '');
    return text.trim();
  };

  const parseAbstractToTextRuns = (abstractText: string): TextRun[] => {
      if (!abstractText) return [];
      const keywords = ["Background", "Methods", "Method", "Results", "Result", "Conclusions", "Conclusion", "Purpose", "Objectives", "Objective"];
      const regex = new RegExp(`(${keywords.join("|")})[:.]?`, "gi");
      const parts = abstractText.split(regex);
      const textRuns: TextRun[] = [];
      parts.forEach((part) => {
          if (!part) return;
          const isKeyword = keywords.some(k => part.toLowerCase().includes(k.toLowerCase()));
          textRuns.push(new TextRun({
              text: part,
              font: "Georgia",
              size: 20,
              bold: isKeyword
          }));
      });
      return textRuns;
  };

  const isEquation = (text: string): boolean => {
      const t = text.trim();
      if (t.length > 150) return false;
      if (t.length < 2) return false;
      const hasMathChars = /[=≈≠≤≥±×÷]/.test(t);
      const isFigureOrTable = /^(Figure|Table)/i.test(t);
      return hasMathChars && !isFigureOrTable && !t.endsWith('.'); 
  };

  const handleDownloadDocx = async () => {
    if (!manuscriptData) return;
    setIsDownloading(true);
    try {
        const frontMatterChildren = [];
        const bodyChildren = [];
        const journalBlue = "005580";
        const uniqueAffiliations = Array.from(new Set(manuscriptData.authors.map(a => a.affiliation)));
        const getAffiliationIndex = (aff: string) => uniqueAffiliations.indexOf(aff) + 1;

        let logoImageRun: any = new Paragraph("");
        if (manuscriptData.logoUrl) {
            try {
                const { data: logoBuffer } = await getImageBuffer(manuscriptData.logoUrl);
                logoImageRun = new Paragraph({
                    children: [new ImageRun({ data: new Uint8Array(logoBuffer), transformation: { width: 76, height: 76 } } as any)]
                });
            } catch (e) { logoImageRun = new Paragraph("[LOGO]"); }
        }

        const headerTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, children: [logoImageRun], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({
                            width: { size: 86, type: WidthType.PERCENTAGE }, 
                            children: [
                                new Paragraph({ children: [new TextRun({ text: "Journal of Biomedical Sciences and Health", bold: true, size: 32, color: journalBlue, font: "Georgia" })], alignment: AlignmentType.RIGHT }),
                                new Paragraph({ children: [new TextRun({ text: "e-ISSN: 3047-7182 | p-ISSN: 3062-6854", font: "Arial", size: 18 })], alignment: AlignmentType.RIGHT }),
                                new Paragraph({ children: [new TextRun({ text: "Available online at ", font: "Arial", size: 18 }), new TextRun({ text: "ejournal.unkaha.ac.id/index.php/jbsh", color: journalBlue, underline: {}, font: "Arial", size: 18 })], alignment: AlignmentType.RIGHT }),
                            ],
                        }),
                    ],
                }),
            ],
        });
        frontMatterChildren.push(headerTable);

        const openAccessTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE }, 
            rows: [ new TableRow({ children: [ new TableCell({ children: [ new Paragraph({ children: [new TextRun({ text: "OPEN ACCESS", color: "FFFFFF", bold: true, size: 26, font: "Arial" })], alignment: AlignmentType.RIGHT, spacing: { before: 80, after: 80 } }) ], shading: { fill: journalBlue, type: ShadingType.CLEAR }, margins: { top: 60, bottom: 60, right: 200 }, }) ] }) ],
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } }
        });
        frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 100 } })); frontMatterChildren.push(openAccessTable); frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 100 } })); 

        frontMatterChildren.push(
            new Paragraph({ children: [ new TextRun({ text: `Vol. ${manuscriptData.volume}, No. ${manuscriptData.issue}, ${manuscriptData.year}         DOI: `, font: "Georgia", size: 18 }), new TextRun({ text: manuscriptData.doi || "doi.xxx", color: journalBlue, font: "Georgia", size: 18 }), new TextRun({ text: `         Pages ${manuscriptData.pages}`, font: "Georgia", size: 18 }) ], border: { bottom: { style: BorderStyle.THICK, size: 12, space: 4 } }, spacing: { after: 200 } })
        );

        frontMatterChildren.push(
            new Paragraph({ children: [new TextRun({ text: "Original Research Article", italics: true, font: "Georgia", size: 22 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: toTitleCase(manuscriptData.title), bold: true, size: 28, font: "Georgia" })], alignment: AlignmentType.CENTER, spacing: { after: 300 } })
        );

        const authorsParagraph = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 } });
        manuscriptData.authors.forEach((a, i) => {
            const cleanName = a.name.replace(/[0-9]+$/, ''); 
            authorsParagraph.addChildElement(new TextRun({ text: cleanName, bold: true, size: 22, font: "Georgia" }));
            const affIdx = getAffiliationIndex(a.affiliation);
            authorsParagraph.addChildElement(new TextRun({ text: `${affIdx}${a.email ? '*' : ''}`, superScript: true, size: 18, font: "Georgia" }));
            if(i < manuscriptData.authors.length - 1) { authorsParagraph.addChildElement(new TextRun({ text: ", ", bold: true, size: 22, font: "Georgia" })); }
        });
        frontMatterChildren.push(authorsParagraph);

        uniqueAffiliations.forEach((aff, i) => { frontMatterChildren.push( new Paragraph({ children: [ new TextRun({ text: `${i+1} `, superScript: true, size: 16 }), new TextRun({ text: aff, italics: true, size: 18, font: "Georgia" }) ], alignment: AlignmentType.CENTER, }) ); });
        const corresp = manuscriptData.authors.find(a => a.email);
        if(corresp) { frontMatterChildren.push( new Paragraph({ children: [new TextRun({ text: `*Correspondence: ${corresp.email}`, size: 16, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 400 } }) ); } else { frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 400 } })); }

        const abstractTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.SINGLE, size: 18, color: journalBlue }, bottom: { style: BorderStyle.SINGLE, size: 6, color: journalBlue }, right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, },
            rows: [ new TableRow({ children: [ new TableCell({ shading: { fill: "F9FAFB", type: ShadingType.CLEAR }, children: [ new Paragraph({ children: [new TextRun({ text: "ABSTRACT", bold: true, color: journalBlue, font: "Arial", size: 20 })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 200 } }), new Paragraph({ children: parseAbstractToTextRuns(manuscriptData.abstract), alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 } }), new Paragraph({ children: [new TextRun({ text: "Keywords: ", bold: true, font: "Georgia", size: 20 }), new TextRun({ text: manuscriptData.keywords.join("; "), font: "Georgia", size: 20 })], spacing: { after: 100 }, alignment: AlignmentType.JUSTIFIED }) ], margins: { top: 200, bottom: 200, left: 200, right: 200 } }) ] }) ]
        });
        frontMatterChildren.push(abstractTable); frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));

        frontMatterChildren.push(new Paragraph({ children: [new TextRun({ text: "Received: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${manuscriptData.receivedDate} | `, font: "Arial", size: 16 }), new TextRun({ text: "Accepted: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${manuscriptData.acceptedDate} | `, font: "Arial", size: 16 }), new TextRun({ text: "Published: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${manuscriptData.publishedDate}`, font: "Arial", size: 16 })], alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, space: 1, color: "DDDDDD" } }, spacing: { before: 200, after: 200 } }));
        const citationAuthors = manuscriptData.authors.length > 2 ? `${manuscriptData.authors[0].name} et al.` : manuscriptData.authors.map(a => a.name).join(' & ');
        const citationTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 24, color: journalBlue }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, }, rows: [ new TableRow({ children: [ new TableCell({ shading: { fill: "F0F9FF", type: ShadingType.CLEAR }, children: [ new Paragraph({ children: [ new TextRun({ text: "Cite this article: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${citationAuthors} (${manuscriptData.year}). ${manuscriptData.title}. `, font: "Georgia", size: 16 }), new TextRun({ text: "Journal of Biomedical Sciences and Health", italics: true, font: "Georgia", size: 16 }), new TextRun({ text: `, ${manuscriptData.volume}(${manuscriptData.issue}), ${manuscriptData.pages}. https://doi.org/${manuscriptData.doi}`, font: "Georgia", size: 16 }) ], alignment: AlignmentType.JUSTIFIED }) ], margins: { left: 100, right: 100, top: 100, bottom: 100 } }) ] }) ] });
        frontMatterChildren.push(citationTable); frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        
        let unlockIconRun: any = new Paragraph(""); try { const { data: unlockBuffer } = await getImageBuffer(UNLOCK_ICON_URL); unlockIconRun = new ImageRun({ data: new Uint8Array(unlockBuffer), transformation: { width: 15, height: 15 } } as any); } catch(e) { console.warn("Unlock icon fetch failed", e); }
        const openAccessBoxTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, bottom: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, left: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, right: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, insideVertical: { style: BorderStyle.NONE } }, rows: [ new TableRow({ children: [ new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [ new Paragraph({ children: [unlockIconRun], alignment: AlignmentType.CENTER }) ], verticalAlign: VerticalAlign.CENTER, shading: { fill: "F3F4F6", type: ShadingType.CLEAR } }), new TableCell({ width: { size: 95, type: WidthType.PERCENTAGE }, children: [ new Paragraph({ children: [ new TextRun({ text: "Open Access. ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: "This article is an open access article distributed under the terms and conditions of the Creative Commons Attribution 4.0 International License (CC BY 4.0).", font: "Arial", size: 16 }) ], alignment: AlignmentType.JUSTIFIED }) ], margins: { top: 100, bottom: 100, left: 100, right: 100 }, verticalAlign: VerticalAlign.CENTER }) ] }) ] });
        frontMatterChildren.push(openAccessBoxTable); frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 400 } }));

        const placedFigures = new Set<string>();
        for (const section of manuscriptData.sections) {
            bodyChildren.push(new Paragraph({ children: [new TextRun({ text: section.heading, bold: true, color: "000000", font: "Arial", size: 22 })], heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 100 }, indent: { firstLine: 0 } }));
            const paragraphs = stripHtmlToText(section.content).split(/\n\n+/);
            for (const paraText of paragraphs) {
                if (!paraText.trim()) continue;
                const isMainHeading = paraText.length < 100 && (/^\d+\.\s+[A-Z]/.test(paraText.trim()) || /^[A-Z\s\W]+$/.test(paraText.trim()));
                const isSubHeading = paraText.length < 100 && /^\d+(\.\d+)+/.test(paraText.trim());
                const isHeading = isMainHeading || isSubHeading;
                const isFormula = isEquation(paraText);
                const indentValue = (isHeading || isFormula) ? 0 : 567;

                bodyChildren.push(new Paragraph({ children: [new TextRun({ text: paraText, font: isFormula ? "Cambria Math" : "Georgia", size: 21, bold: isHeading, italics: isFormula })], alignment: isFormula ? AlignmentType.CENTER : AlignmentType.JUSTIFIED, spacing: { after: 200 }, indent: { firstLine: indentValue } }));

                const regex = /(?:Figure|Fig\.?)\s*(\d+)/gi;
                let match;
                while ((match = regex.exec(paraText)) !== null) {
                    const figId = match[1];
                    if (!placedFigures.has(figId)) {
                        const fig = manuscriptData.figures.find(f => f.id === figId);
                        if (fig) {
                             placedFigures.add(figId);
                             let figRun: any = new TextRun(`[Image: ${fig.caption}]`);
                             try { const { data: buf } = await getImageBuffer(fig.fileUrl); figRun = new ImageRun({ data: new Uint8Array(buf), transformation: { width: 300, height: 300 } } as any); } catch(e) { console.error(e) }
                             bodyChildren.push(new Paragraph({ children: [figRun], alignment: AlignmentType.CENTER, spacing: { before: 100 } }));
                             bodyChildren.push(new Paragraph({ children: [ new TextRun({ text: `Figure ${fig.id}: `, bold: true, color: journalBlue, font: "Arial", size: 18 }), new TextRun({ text: fig.caption, font: "Arial", size: 18 }) ], alignment: AlignmentType.CENTER, spacing: { before: 50, after: 300 } }));
                        }
                    }
                }
            }
        }

        const remainingFigures = manuscriptData.figures.filter(f => !placedFigures.has(f.id));
        if (remainingFigures.length > 0) {
            bodyChildren.push(new Paragraph({ children: [new TextRun({ text: "ADDITIONAL FIGURES", bold: true, font: "Arial", size: 22 })], spacing: { before: 400, after: 200 } }));
            for (const fig of remainingFigures) {
                let figRun: any = new TextRun(`[Image: ${fig.caption}]`);
                try { const { data: buf } = await getImageBuffer(fig.fileUrl); figRun = new ImageRun({ data: new Uint8Array(buf), transformation: { width: 300, height: 300 } } as any); } catch(e) { console.error(e) }
                bodyChildren.push( new Paragraph({ children: [figRun], alignment: AlignmentType.CENTER, spacing: { before: 100 } }), new Paragraph({ children: [ new TextRun({ text: `Figure ${fig.id}: `, bold: true, color: journalBlue, font: "Arial", size: 18 }), new TextRun({ text: fig.caption, font: "Arial", size: 18 }) ], alignment: AlignmentType.CENTER, spacing: { before: 50, after: 300 } }) );
            }
        }

        bodyChildren.push( new Paragraph({ children: [new TextRun({ text: "REFERENCES", bold: true, font: "Arial", size: 22 })], heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, border: { top: { style: BorderStyle.SINGLE, size: 6 } } }) );
        manuscriptData.references.forEach((ref) => { bodyChildren.push( new Paragraph({ children: [new TextRun({ text: ref, font: "Georgia", size: 18 })], alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 }, indent: { left: 567, hanging: 567 } }) ); });

        const footerPage1 = new Footer({ children: [ new Paragraph({ children: [] }) ] });
        const footerDefault = new Footer({ children: [ new Paragraph({ children: [new TextRun({ text: "Journal of Biomedical Sciences and Health", bold: true, font: "Arial", size: 16 })], alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 6, space: 4 } }, spacing: { before: 100 } }), new Paragraph({ children: [new TextRun({ text: `Copyright © ${manuscriptData.year} The Author(s). Published by Universitas Karya Husada Semarang, Indonesia`, font: "Arial", size: 16 })], alignment: AlignmentType.CENTER }), new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT], bold: true, size: 20, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 100 } }) ] });

        const runningHeadLeft = manuscriptData.authors.length > 2 ? `${manuscriptData.authors[0].name.split(' ').pop()} et al.` : manuscriptData.authors.map(a => a.name.split(' ').pop()).join(' & ');
        const runningHeadRight = `J. Biomed. Sci. Health. ${manuscriptData.year}; ${manuscriptData.volume}(${manuscriptData.issue}): ${manuscriptData.pages}`;
        const runningHeaderTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, }, rows: [ new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: runningHeadLeft, italics: true, font: "Arial", size: 16 })], alignment: AlignmentType.LEFT })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: runningHeadRight, font: "Arial", size: 16 })], alignment: AlignmentType.RIGHT })] }) ] }) ] });
        const headerDefault = new Header({ children: [runningHeaderTable, new Paragraph({text: "", spacing: {after: 200}})] });

        const doc = new Document({
            sections: [
                { properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: "2.5cm", bottom: "2.5cm", left: "2.5cm", right: "2.5cm" } } }, children: frontMatterChildren, headers: { default: new Header({ children: [] }) }, footers: { default: footerPage1 } },
                { properties: { column: { count: 2, space: 400 }, type: SectionType.CONTINUOUS }, children: bodyChildren, headers: { default: headerDefault }, footers: { default: footerDefault } }
            ]
        });

        const blob = await Packer.toBlob(doc);
        FileSaver.saveAs(blob, "JBSH_Manuscript.docx");

    } catch (err) { console.error("Docx generation failed", err); alert("Failed to generate DOCX file. Please check console for details."); } finally { setIsDownloading(false); }
  };

  const handleUpdateField = <K extends keyof ManuscriptData>(field: K, value: ManuscriptData[K]) => { if (!manuscriptData) return; setManuscriptData({ ...manuscriptData, [field]: value }); };
  const handleUpdateSection = (index: number, newContent: string) => { if (!manuscriptData) return; const newSections = [...manuscriptData.sections]; newSections[index].content = newContent; setManuscriptData({ ...manuscriptData, sections: newSections }); };
  const handleUpdateFigureOrder = (index: number, direction: 'up' | 'down') => { if (!manuscriptData) return; const newFigures = [...manuscriptData.figures]; if (direction === 'up' && index > 0) { [newFigures[index - 1], newFigures[index]] = [newFigures[index], newFigures[index - 1]]; } else if (direction === 'down' && index < newFigures.length - 1) { [newFigures[index + 1], newFigures[index]] = [newFigures[index], newFigures[index + 1]]; } setManuscriptData({...manuscriptData, figures: newFigures}); }
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { if (manuscriptData) { setManuscriptData({ ...manuscriptData, logoUrl: e.target?.result as string }); } }; reader.readAsDataURL(file); };
  const handleAddFigure = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !manuscriptData) return; const reader = new FileReader(); reader.onload = (e) => { const newFigure: ManuscriptFigure = { id: (manuscriptData.figures.length + 1).toString(), fileUrl: e.target?.result as string, caption: newFigCaption || `Figure ${manuscriptData.figures.length + 1}` }; setManuscriptData({ ...manuscriptData, figures: [...manuscriptData.figures, newFigure] }); setNewFigCaption(""); }; reader.readAsDataURL(file); };
  const handleRemoveFigure = (id: string) => { if (!manuscriptData) return; setManuscriptData({ ...manuscriptData, figures: manuscriptData.figures.filter(f => f.id !== id) }); };

  // --- REUSABLE QUALITY CONTROL SIDEBAR ---
  const renderQualityControlSidebar = () => (
    <div className={`p-4 rounded-xl shadow-lg border-2 ${
        validationStats?.status === 'success' ? 'bg-green-50 border-green-200' :
        validationStats?.status === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'
    }`}>
        <div className="flex items-center gap-2 mb-3 border-b border-black/10 pb-2">
            <FileSearch size={20} className={validationStats?.status === 'success' ? 'text-green-600' : validationStats?.status === 'warning' ? 'text-yellow-600' : 'text-red-600'} />
            <h3 className="font-bold text-sm text-slate-800">Quality Control</h3>
        </div>
        
        {validationStats ? (
            <div className="space-y-4">
                {/* Word Count Comparison */}
                <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Transfer Integrity</p>
                    <div className="flex items-end gap-2">
                        <span className={`text-2xl font-bold ${
                            validationStats.status === 'success' ? 'text-green-700' : 
                            validationStats.status === 'warning' ? 'text-yellow-700' : 'text-red-700'
                        }`}>{validationStats.coveragePercent}%</span>
                        <span className="text-xs text-slate-500 mb-1">match rate</span>
                    </div>
                    <div className="w-full bg-white h-2 rounded-full mt-1 border border-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${
                            validationStats.status === 'success' ? 'bg-green-500' : 
                            validationStats.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                        }`} style={{width: `${validationStats.coveragePercent}%`}}></div>
                    </div>
                </div>

                {/* Structure Check */}
                <div>
                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Missing Parts (IMRAD)</p>
                    {validationStats.missingSections.length === 0 ? (
                        <div className="flex items-center gap-1.5 text-green-700 text-xs font-bold bg-green-100 p-1.5 rounded">
                            <CheckCircle size={12} /> All sections present
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {validationStats.missingSections.map(miss => (
                                <div key={miss} className="flex items-center gap-1.5 text-red-700 text-xs bg-red-100 p-1.5 rounded">
                                    <AlertTriangle size={12} /> Missing: {miss}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Formatting & Writing Errors */}
                <div>
                    <p className="text-xs text-slate-500 uppercase font-bold mb-1">Writing & Formatting</p>
                    {validationStats.formattingIssues.length === 0 ? (
                        <div className="flex items-center gap-1.5 text-green-700 text-xs font-bold bg-green-100 p-1.5 rounded">
                            <CheckCircle size={12} /> No major issues
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {validationStats.formattingIssues.map((issue, idx) => (
                                <div key={idx} className="flex items-start gap-1.5 text-yellow-800 text-[10px] bg-yellow-100 p-1.5 rounded leading-tight">
                                    <SearchX size={12} className="shrink-0 mt-0.5" /> <span>{issue}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-black/5">
                    <div className="bg-white p-2 rounded border border-slate-100">
                        <p className="text-slate-400">Original</p>
                        <p className="font-bold text-slate-700">{validationStats.originalWordCount} words</p>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-100">
                        <p className="text-slate-400">Generated</p>
                        <p className="font-bold text-slate-700">{validationStats.generatedWordCount} words</p>
                    </div>
                </div>
            </div>
        ) : (
            <p className="text-xs text-slate-400">Analyzing content...</p>
        )}
    </div>
  );

  // --- RENDER LOGIN SCREEN ---
  if (appState === AppState.LOGIN) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center font-sans-journal p-4">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full border border-slate-200">
          <div className="text-center mb-8">
            <div className="inline-block bg-white text-[#0083B0] px-3 py-2 rounded-lg font-bold text-3xl tracking-tight shadow-sm border border-blue-200 mb-4">
                JBSH
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Editor Login</h1>
            <p className="text-slate-500 mt-2 text-sm">Restricted access for authorized editors only.</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded text-sm flex items-center gap-2 border border-red-200">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User size={18} />
                </div>
                <input 
                  type="email" 
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083B0] outline-none transition-all"
                  placeholder="name@unkaha.ac.id"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <LogIn size={18} />
                </div>
                <input 
                  type="password" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083B0] outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            
            <button 
              type="submit"
              className="w-full bg-gradient-to-r from-[#0083B0] to-[#00B4DB] text-white py-2.5 rounded-lg font-bold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 mt-2"
            >
              Sign In
            </button>
          </form>
          
          <div className="mt-6 text-center text-xs text-slate-400 border-t pt-4">
            &copy; {new Date().getFullYear()} Journal of Biomedical Sciences and Health
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER MAIN APP ---
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans-journal">
      <nav className="bg-gradient-to-r from-[#0083B0] to-[#00B4DB] text-white p-4 shadow-md no-print sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <button onClick={handleGoHome} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors mr-2 flex items-center justify-center border border-white/20" title="Home / Dashboard">
                <Home size={20} />
             </button>
            <div className="bg-white text-[#0083B0] px-2 py-1 rounded font-bold text-xl tracking-tight shadow-sm border border-blue-200">
                JBSH
            </div>
            <h1 className="text-lg font-semibold tracking-wide hidden sm:block">Editor Assistant Tool</h1>
          </div>
          <div className="flex items-center gap-2">
             {appState === AppState.PREVIEW && (
                 <>
                    <div className="flex bg-white/20 rounded-md p-0.5 mr-2">
                        <button 
                            onClick={() => setPreviewTab('manuscript')} 
                            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${previewTab === 'manuscript' ? 'bg-white text-[#0083B0] shadow-sm' : 'text-white hover:bg-white/10'}`}
                        >
                            <Layout size={16} /> Manuscript
                        </button>
                        <button 
                            onClick={() => setPreviewTab('loa')} 
                            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${previewTab === 'loa' ? 'bg-white text-[#0083B0] shadow-sm' : 'text-white hover:bg-white/10'}`}
                        >
                            <FileSignature size={16} /> LoA
                        </button>
                    </div>

                    {previewTab === 'manuscript' ? (
                        <>
                            <button onClick={() => setIsEditingPreview(!isEditingPreview)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm ${isEditingPreview ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-300" : "bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"}`}>{isEditingPreview ? <Check size={16} /> : <Edit size={16} />}{isEditingPreview ? "Done Editing" : "Edit"}</button>
                            <button onClick={() => setAppState(AppState.METADATA_REVIEW)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm"><ChevronLeft size={16} />Meta</button>
                            <button onClick={handleDownloadPDF} disabled={isDownloading} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm">{isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<Save size={16} />)}PDF</button>
                            <button onClick={handleDownloadDocx} disabled={isDownloading} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm">{isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<FileDown size={16} />)}Docx</button>
                        </>
                    ) : (
                        <div className="flex items-center bg-emerald-700/50 rounded-md p-0.5 ml-2 border border-emerald-500/50">
                            <button onClick={handleDownloadLoA} disabled={isDownloading} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors shadow-sm mr-0.5" title="Download LoA PDF">
                                {isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<FileSignature size={16} />)} PDF
                            </button>
                            <button onClick={handleEmailLoA} disabled={isSendingEmail} className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors shadow-sm" title="Send LoA via Email">
                                {isSendingEmail ? <div className="animate-spin h-3 w-3 border-2 border-white rounded-full border-t-transparent"></div> : <Mail size={16} />} Email
                            </button>
                        </div>
                    )}

                    <button onClick={() => setShowEmailSettings(true)} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-md transition-colors ml-1" title="Email Settings">
                        <Settings size={18} />
                    </button>
                    
                    {/* Only show Print button for Manuscript for now, or adapt it */}
                    {previewTab === 'manuscript' && (
                        <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm ml-2"><Printer size={16} />Print</button>
                    )}
                 </>
             )}
            {appState !== AppState.UPLOAD && appState !== AppState.PROCESSING && (<button onClick={() => { setAppState(AppState.UPLOAD); setManuscriptData(null); setRawText(''); }} className="text-white/80 hover:text-white" title="Start Over"><RefreshCw size={18} /></button>)}
            
            {/* User Info & Logout */}
            <div className="h-6 w-px bg-white/30 mx-2"></div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium hidden md:inline-block opacity-90">{currentUser}</span>
              <button onClick={handleLogout} className="bg-white/10 hover:bg-white/20 p-1.5 rounded text-white transition-colors" title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow p-4 md:p-8">
        {/* Email Settings Modal */}
        {showEmailSettings && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center p-4 border-b">
                        <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} className="text-slate-500"/> Email Configuration</h3>
                        <button onClick={() => setShowEmailSettings(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>
                    
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        {/* Help Section */}
                        <div className="bg-slate-50 p-4 rounded text-sm mb-4 border border-slate-200">
                            <h4 className="font-bold mb-2 flex items-center gap-2"><Info size={16} className="text-blue-500"/> How to set up EmailJS:</h4>
                            <ol className="list-decimal pl-4 space-y-2 text-xs text-slate-700">
                                <li>
                                    Go to <a href="https://dashboard.emailjs.com/admin/account" target="_blank" className="text-blue-600 underline font-bold inline-flex items-center gap-0.5">Account &gt; API Keys <ExternalLink size={10} /></a> to find your <b>Public Key</b>.
                                </li>
                                <li>
                                    Go to <b>Email Templates</b> and create a new template. Save it to get the <b>Template ID</b>.
                                </li>
                                <li>
                                    In the template content, use these variables:
                                    <ul className="list-disc pl-4 mt-1 font-mono text-[10px] text-slate-600 bg-white p-2 rounded border border-slate-200">
                                        <li>{`{{to_name}}`} - Author Name</li>
                                        <li>{`{{article_title}}`} - Title</li>
                                        <li>{`{{to_email}}`} - Author Email</li>
                                    </ul>
                                </li>
                                <li className="text-amber-700 italic">
                                    Note: Attachments on Free Tier might require specific config. Ensure the recipient email field is mapped to <code>{`{{to_email}}`}</code> in the template settings.
                                </li>
                            </ol>
                        </div>

                        <div className="bg-blue-50 text-blue-800 p-3 rounded text-sm mb-4">
                            To enable direct email sending, create a free account at <a href="https://www.emailjs.com/" target="_blank" className="underline font-bold">EmailJS.com</a>.
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Service ID</label>
                            <input type="text" value={emailConfig.serviceId} onChange={e => setEmailConfig({...emailConfig, serviceId: e.target.value})} className="w-full border p-2 rounded text-sm" placeholder="service_xxxxx" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Template ID</label>
                            <input type="text" value={emailConfig.templateId} onChange={e => setEmailConfig({...emailConfig, templateId: e.target.value})} className="w-full border p-2 rounded text-sm" placeholder="template_xxxxx" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Public Key</label>
                            <input type="text" value={emailConfig.publicKey} onChange={e => setEmailConfig({...emailConfig, publicKey: e.target.value})} className="w-full border p-2 rounded text-sm" placeholder="Public Key (User ID)" />
                        </div>
                    </div>
                    <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 rounded-b-xl">
                        <button onClick={() => setShowEmailSettings(false)} className="px-4 py-2 text-slate-600 text-sm hover:bg-slate-200 rounded">Cancel</button>
                        <button onClick={saveEmailConfig} className="px-4 py-2 bg-[#0083B0] text-white text-sm font-bold rounded hover:bg-[#007299]">Save Config</button>
                    </div>
                </div>
            </div>
        )}

        {appState === AppState.UPLOAD && (
          <div className="max-w-2xl mx-auto mt-10 animate-in fade-in slide-in-from-bottom-8 no-print">
            <div className="bg-white rounded-xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-[#0083B0] to-[#00B4DB] p-8 text-white text-center">
                    <div className="inline-block bg-white text-[#0083B0] px-4 py-2 rounded-lg font-bold text-4xl tracking-tight shadow-lg border-2 border-white/20 mb-4">
                        JBSH
                    </div>
                    <h2 className="text-2xl font-bold mb-2">JBSH Manuscript Generator</h2>
                    <p className="opacity-90">Upload manuscript to generate a professional Scopus-level layout.</p>
                </div>
                <div className="p-8">
                    {error && (
                        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex flex-col gap-2 border border-red-200">
                             <div className="flex items-center gap-3"><AlertCircle size={20} /> <span className="font-bold">Error:</span> {error}</div>
                             <div className="pl-8 text-sm">
                                 <p className="mb-2">If AI is failing, you can skip it and edit manually:</p>
                                 <button onClick={handleManualProcessing} className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded font-bold text-xs hover:bg-red-50 transition-colors flex items-center gap-2 inline-flex">
                                     <ZapOff size={14} /> Switch to Manual Mode
                                 </button>
                             </div>
                        </div>
                    )}
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors group relative cursor-pointer">
                        <div className="flex flex-col items-center gap-4 relative z-0"><div className="p-4 bg-sky-50 text-[#007398] rounded-full group-hover:scale-110 transition-transform"><Upload size={32} /></div><div><h3 className="font-bold text-slate-800 text-lg">Upload Manuscript File</h3><p className="text-slate-500 text-sm mt-1">Supports .docx, .html, .txt, .md</p></div></div>
                        <input type="file" accept=".docx,.txt,.md,.html,.htm" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"/>
                    </div>
                    <div className="mt-8">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Or paste manuscript text directly:</label>
                        <textarea className="w-full h-48 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#007398] outline-none resize-none font-serif" placeholder="Paste Title, Abstract, Introduction, etc. here..." value={rawText} onChange={(e) => setRawText(e.target.value)} />
                        
                        <div className="flex gap-3 mt-4">
                            <button onClick={handleManualText} className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors flex justify-center items-center gap-2">
                                <FileText size={18} /> Process with AI
                            </button>
                            <button onClick={handleManualProcessing} className="flex-1 bg-white text-slate-700 border border-slate-300 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors flex justify-center items-center gap-2" title="Bypass AI if server is busy">
                                <ZapOff size={18} /> Skip AI (Manual)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        )}

        {appState === AppState.PROCESSING && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center no-print">
            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-[#00B4DB] rounded-full border-t-transparent animate-spin"></div>
                <div className="bg-white text-[#0083B0] px-1.5 py-0.5 rounded font-bold text-sm tracking-tight shadow-sm border border-blue-100 relative z-10">
                    JBSH
                </div>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Analyzing Manuscript...</h2><p className="text-slate-500 max-w-md">Processing full text. This may take a moment for large files.</p>
          </div>
        )}

        {appState === AppState.METADATA_REVIEW && manuscriptData && (
             <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 no-print flex gap-6">
                
                {/* VALIDATION SIDEBAR (LEFT) - ENHANCED FOR QUALITY CONTROL */}
                <div className="w-64 shrink-0 space-y-6 hidden lg:block">
                    {renderQualityControlSidebar()}
                </div>

                {/* MAIN CONTENT FORM */}
                <div className="flex-1 bg-white shadow-xl rounded-xl overflow-hidden">
                    <div className="bg-slate-800 p-6 text-white flex justify-between items-center sticky top-0 z-40"><div><h2 className="text-2xl font-bold">Metadata & Assets Review</h2><p className="opacity-80 text-sm">Verify details and upload figures before generating the PDF.</p></div><div className="bg-[#00B4DB] px-4 py-1.5 rounded-full text-xs font-bold tracking-wide">JBSH EDITOR</div></div>
                    <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="space-y-6 lg:col-span-1 border-r border-slate-200 pr-0 lg:pr-6">
                            <h3 className="font-bold text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><FileText size={18} className="text-[#00B4DB]" /> Article Metadata</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vol</label><input type="text" value={manuscriptData.volume} onChange={(e) => handleUpdateField('volume', e.target.value)} className="w-full border border-slate-300 p-2 rounded text-sm" /></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Issue</label><input type="text" value={manuscriptData.issue} onChange={(e) => handleUpdateField('issue', e.target.value)} className="w-full border border-slate-300 p-2 rounded text-sm" /></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Year</label><input type="text" value={manuscriptData.year} onChange={(e) => handleUpdateField('year', e.target.value)} className="w-full border border-slate-300 p-2 rounded text-sm" /></div>
                                <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pages</label><input type="text" value={manuscriptData.pages} onChange={(e) => handleUpdateField('pages', e.target.value)} className="w-full border border-slate-300 p-2 rounded text-sm" /></div>
                            </div>
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">DOI</label><input type="text" value={manuscriptData.doi} onChange={(e) => handleUpdateField('doi', e.target.value)} className="w-full border border-slate-300 p-2 rounded text-sm" /></div>
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Title</label><textarea value={manuscriptData.title} onChange={(e) => handleUpdateField('title', e.target.value)} className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-1 focus:ring-[#007398] outline-none" rows={3}/></div>
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Abstract</label><textarea value={manuscriptData.abstract} onChange={(e) => handleUpdateField('abstract', e.target.value)} className="w-full border border-slate-300 p-2 rounded text-sm focus:ring-1 focus:ring-[#007398] outline-none" rows={6}/></div>
                        </div>

                        <div className="space-y-6 lg:col-span-1 border-r border-slate-200 pr-0 lg:pr-6">
                            <h3 className="font-bold text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><ImageIcon size={18} className="text-[#00B4DB]" /> Manuscript Figures</h3>
                            <div className="bg-slate-50 p-4 rounded-lg border border-dashed border-slate-300">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Add New Figure</label>
                                <input type="text" placeholder="Figure Caption (e.g. Figure 1. Chart of growth)" className="w-full border p-2 rounded text-sm mb-2" value={newFigCaption} onChange={(e) => setNewFigCaption(e.target.value)}/>
                                <div className="relative w-full"><button className="w-full bg-slate-200 text-slate-700 py-2 rounded text-sm font-medium hover:bg-slate-300 transition-colors flex items-center justify-center gap-2"><Plus size={16} /> Upload Image</button><input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAddFigure}/></div>
                            </div>
                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                                {manuscriptData.figures.length === 0 && (<p className="text-center text-slate-400 text-sm py-4 italic">No figures added yet.</p>)}
                                {manuscriptData.figures.map((fig) => (
                                    <div key={fig.id} className="flex gap-3 bg-white p-3 rounded shadow-sm border border-slate-100 relative group">
                                        <img src={fig.fileUrl} className="w-16 h-16 object-cover rounded bg-slate-100" />
                                        <div className="flex-1 min-w-0"><p className="text-xs font-bold text-slate-700 truncate">Figure {fig.id}</p><p className="text-[10px] text-slate-500 line-clamp-2 leading-tight">{fig.caption}</p></div>
                                        <button onClick={() => handleRemoveFigure(fig.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-6 lg:col-span-1">
                            <h3 className="font-bold text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><RefreshCw size={18} className="text-[#00B4DB]" /> Journal Branding</h3>
                            <div className="bg-slate-50 p-4 rounded border border-slate-200 text-center"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">JBSH Logo</label>{manuscriptData.logoUrl ? (<img src={manuscriptData.logoUrl} className="h-16 mx-auto object-contain mb-3" />) : <div className="h-16 bg-slate-200 w-full mb-3"></div>}<div className="relative inline-block"><button className="text-[10px] bg-white border border-slate-300 px-3 py-1 rounded shadow-sm hover:bg-slate-50">Change Logo</button><input type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer" /></div></div>
                            <div className="space-y-3 mt-6"><label className="block text-[10px] font-bold text-slate-500 uppercase">Publishing Dates</label><div className="grid grid-cols-1 gap-2"><div className="flex items-center gap-2"><span className="w-16 text-[10px] text-slate-500">Received:</span><input type="text" value={manuscriptData.receivedDate} onChange={(e) => handleUpdateField('receivedDate', e.target.value)} className="flex-1 border p-1.5 rounded text-xs" /></div><div className="flex items-center gap-2"><span className="w-16 text-[10px] text-slate-500">Accepted:</span><input type="text" value={manuscriptData.acceptedDate} onChange={(e) => handleUpdateField('acceptedDate', e.target.value)} className="flex-1 border p-1.5 rounded text-xs" /></div><div className="flex items-center gap-2"><span className="w-16 text-[10px] text-slate-500">Published:</span><input type="text" value={manuscriptData.publishedDate} onChange={(e) => handleUpdateField('publishedDate', e.target.value)} className="flex-1 border p-1.5 rounded text-xs" /></div></div></div>
                            <div className="mt-8 pt-8 border-t"><button onClick={() => setAppState(AppState.PREVIEW)} className="w-full bg-[#0083B0] text-white py-3 rounded-lg font-bold hover:bg-[#007299] transition-colors flex items-center justify-center gap-2 shadow-lg text-lg">Generate Layout <ArrowRight size={20} /></button><button onClick={() => setAppState(AppState.UPLOAD)} className="w-full mt-3 py-2 text-slate-500 text-sm hover:text-slate-700">Cancel</button></div>
                        </div>
                    </div>
                </div>
             </div>
        )}

        {appState === AppState.PREVIEW && manuscriptData && (
          <div className="max-w-[1600px] mx-auto flex items-start gap-8 justify-center p-4">
             {/* QC Sidebar - Reused logic, ensure "no-print" class */}
             <div className="w-72 shrink-0 space-y-6 hidden xl:block no-print sticky top-24">
                 {renderQualityControlSidebar()}
             </div>

             {/* Preview Content */}
             <div className="flex-1 flex justify-center min-w-0" id="printable-content">
                {previewTab === 'manuscript' ? (
                    <div className="w-full flex justify-center">
                        <LayoutPreview 
                            data={manuscriptData} 
                            isEditable={isEditingPreview}
                            onUpdateField={handleUpdateField}
                            onUpdateSection={handleUpdateSection}
                            onUpdateFigureOrder={handleUpdateFigureOrder}
                            onRemoveFigure={handleRemoveFigure}
                        />
                    </div>
                ) : (
                    <div className="w-full flex justify-center">
                        <div className="w-full max-w-[210mm] bg-white shadow-2xl min-h-[297mm]">
                             <LoaTemplate 
                                data={manuscriptData} 
                                isEditable={true} 
                                onUpdate={(field, value) => handleUpdateField(field, value as any)} 
                            />
                        </div>
                    </div>
                )}
             </div>
          </div>
        )}

        {/* --- HIDDEN LOA TEMPLATE FOR PDF GENERATION --- 
            This template ensures that regardless of the current view, we have a clean, standard LoA ready for generation.
            It shares the same `manuscriptData` state, so edits in the visible preview will automatically update this hidden view.
        */}
        {manuscriptData && (
            <div className="absolute top-[-9999px] left-[-9999px]">
                <div id="loa-hidden-template" style={{ width: '210mm', minHeight: '297mm' }}>
                   <LoaTemplate data={manuscriptData} isEditable={false} />
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
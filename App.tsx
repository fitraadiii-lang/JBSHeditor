import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ManuscriptData, AppState, ManuscriptFigure } from './types';
import { parseManuscript } from './services/geminiService';
import { LayoutPreview } from './components/LayoutPreview';
import { Upload, FileText, Printer, ChevronLeft, RefreshCw, AlertCircle, ArrowRight, Image as ImageIcon, Plus, Trash2, FileDown, Edit, Check, Save, LogIn, User, LogOut, Home, FileSearch, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, SectionType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType, Header, Footer, PageNumber, VerticalAlign } from "docx";
import FileSaver from "file-saver";

// Default JBSH Logo from user request
const DEFAULT_LOGO_URL = "https://i.ibb.co.com/84Q0yL5/jbsh-logo.jpg";
// Unlock icon for DOCX generation (Open Access Box)
const UNLOCK_ICON_URL = "https://img.icons8.com/ios-glyphs/60/737373/unlock.png";

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
}

const App: React.FC = () => {
  // Start at LOGIN state
  const [appState, setAppState] = useState<AppState>(AppState.LOGIN);
  const [manuscriptData, setManuscriptData] = useState<ManuscriptData | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [validationStats, setValidationStats] = useState<ValidationStats | null>(null);

  // Auth State
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [currentUser, setCurrentUser] = useState<string>("");

  // New State for Figure Upload inputs
  const [newFigCaption, setNewFigCaption] = useState("");

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
  };

  // --- VALIDATION LOGIC ---
  const runValidation = (original: string, generated: ManuscriptData) => {
      // 1. Helper to clean text and get words array
      const getWords = (text: string) => {
          return text
            .replace(/<[^>]*>/g, ' ') // Strip HTML
            .replace(/\[FIGURE REMOVED\]/g, ' ')
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3); // Only count significant words > 3 chars
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
      const uniqueOriginalWords = new Set(originalWords);
      let foundCount = 0;
      uniqueOriginalWords.forEach(w => {
          if (generatedWordSet.has(w)) foundCount++;
      });
      
      const coverage = uniqueOriginalWords.size > 0 
        ? Math.round((foundCount / uniqueOriginalWords.size) * 100) 
        : 0;

      // 4. Determine Status
      let status: 'success' | 'warning' | 'danger' = 'success';
      if (coverage < 70 || genCount < origCount * 0.6) status = 'danger';
      else if (coverage < 85 || genCount < origCount * 0.8) status = 'warning';

      setValidationStats({
          originalWordCount: origCount,
          generatedWordCount: genCount,
          coveragePercent: coverage,
          status
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
           // 1. Convert to HTML to get structure and IMAGES
           const result = await mammoth.convertToHtml({ arrayBuffer });
           const fullHtml = result.value;
           
           // 2. Extract Images from the HTML result locally
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

           // 3. Remove heavy base64 images from text before sending to Gemini to save tokens
           // We keep the rest of the HTML (tables, paragraphs) intact.
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
       // HTML File Support
       const reader = new FileReader();
       reader.onload = async (e) => {
         const text = e.target?.result as string;
         
         // Try to extract images if they are embedded base64
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
       // Assume text/md
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
      if (rawText.trim().length < 50) {
          setError("Text is too short. Please paste the full manuscript.");
          return;
      }
      processManuscript(rawText);
  }

  const processManuscript = async (text: string, initialFigures: ManuscriptFigure[] = []) => {
    setAppState(AppState.PROCESSING);
    setError(null);
    setValidationStats(null);
    try {
      const data = await parseManuscript(text);
      
      // Inject Default Logo if not provided by parser
      if (!data.logoUrl || data.logoUrl.includes('placeholder')) {
         data.logoUrl = DEFAULT_LOGO_URL;
      }
      
      // MERGE FIGURES: Use extracted figures from Docx if available, otherwise empty
      if (initialFigures.length > 0) {
          data.figures = initialFigures;
      } else if (!data.figures) {
          data.figures = [];
      }

      // RUN VALIDATION
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

  const getImageBuffer = async (url: string): Promise<{ data: ArrayBuffer, extension: "png" | "jpeg" | "gif" | "bmp" }> => {
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          const data = await blob.arrayBuffer();
          const mime = blob.type.toLowerCase();
          let extension: "png" | "jpeg" | "gif" | "bmp" = "png";
          
          if (mime.includes("jpeg") || mime.includes("jpg")) extension = "jpeg";
          else if (mime.includes("gif")) extension = "gif";
          else if (mime.includes("bmp")) extension = "bmp";
          // We ignore SVG for now to prevent types error (requires fallback for docx)
          // else if (mime.includes("svg")) extension = "svg";

          return { data, extension };
      } catch (e) {
          console.error("Failed to fetch image for docx", e);
          throw new Error("Image fetch failed");
      }
  };

  const stripHtmlToText = (html: string) => {
    // Rudimentary stripping for DOCX text run fallback
    let text = html;
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n'); // IMPORTANT: Newlines between paragraphs
    text = text.replace(/<\/tr>/gi, '\n'); // Table row to newline
    text = text.replace(/<\/td>/gi, '\t'); // Table cell to tab
    text = text.replace(/<\/th>/gi, '\t');
    text = text.replace(/<[^>]+>/g, ''); // Strip all other tags
    return text.trim();
  };

  const handleDownloadDocx = async () => {
    if (!manuscriptData) return;
    setIsDownloading(true);

    try {
        const frontMatterChildren = [];
        const bodyChildren = [];
        const journalBlue = "005580";

        // Logic for unique affiliations (same as preview)
        const uniqueAffiliations = Array.from(new Set(manuscriptData.authors.map(a => a.affiliation)));
        const getAffiliationIndex = (aff: string) => uniqueAffiliations.indexOf(aff) + 1;

        // --- PREPARE LOGO ---
        let logoImageRun: any = new Paragraph("");
        if (manuscriptData.logoUrl) {
            try {
                const { data: logoBuffer, extension: logoExt } = await getImageBuffer(manuscriptData.logoUrl);
                // Note: ImageRun automatically detects type from buffer signature in docx v8.x
                logoImageRun = new Paragraph({
                    children: [
                        new ImageRun({
                            data: new Uint8Array(logoBuffer),
                            transformation: { width: 76, height: 76 },
                            type: logoExt
                        })
                    ]
                });
            } catch (e) {
                console.warn("Could not embed logo in DOCX", e);
                logoImageRun = new Paragraph("[LOGO]");
            }
        }

        // --- FRONT MATTER (Header, Access, DOI, Title, etc.) ---
        // 1. Header Table
        const headerTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
                top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE },
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 14, type: WidthType.PERCENTAGE }, 
                            children: [logoImageRun], 
                            verticalAlign: VerticalAlign.CENTER
                        }),
                        new TableCell({
                            width: { size: 86, type: WidthType.PERCENTAGE }, 
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: "Journal of Biomedical Sciences and Health", bold: true, size: 32, color: journalBlue, font: "Georgia" })],
                                    alignment: AlignmentType.RIGHT,
                                }),
                                new Paragraph({
                                    children: [new TextRun({ text: "e-ISSN: 3047-7182 | p-ISSN: 3062-6854", font: "Arial", size: 18 })],
                                    alignment: AlignmentType.RIGHT,
                                }),
                                new Paragraph({
                                    children: [
                                        new TextRun({ text: "Available online at ", font: "Arial", size: 18 }),
                                        new TextRun({ text: "ejournal.unkaha.ac.id/index.php/jbsh", color: journalBlue, underline: {}, font: "Arial", size: 18 })
                                    ],
                                    alignment: AlignmentType.RIGHT,
                                }),
                            ],
                        }),
                    ],
                }),
            ],
        });
        frontMatterChildren.push(headerTable);

        // 2. Open Access Bar
        const openAccessTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE }, 
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            children: [
                                new Paragraph({ 
                                    children: [new TextRun({ text: "OPEN ACCESS", color: "FFFFFF", bold: true, size: 26, font: "Arial" })], 
                                    alignment: AlignmentType.RIGHT, 
                                    spacing: { before: 80, after: 80 } 
                                })
                            ],
                            shading: { fill: journalBlue, type: ShadingType.CLEAR },
                            margins: { top: 60, bottom: 60, right: 200 }, 
                        })
                    ]
                })
            ],
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } }
        });
        frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 100 } })); 
        frontMatterChildren.push(openAccessTable);
        frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 100 } })); 

        // 3. Vol/DOI Line
        frontMatterChildren.push(
            new Paragraph({
                children: [
                    new TextRun({ text: `Vol. ${manuscriptData.volume}, No. ${manuscriptData.issue}, ${manuscriptData.year}         DOI: `, font: "Georgia", size: 18 }),
                    new TextRun({ text: manuscriptData.doi || "doi.xxx", color: journalBlue, font: "Georgia", size: 18 }),
                    new TextRun({ text: `         Pages ${manuscriptData.pages}`, font: "Georgia", size: 18 })
                ],
                border: { bottom: { style: BorderStyle.THICK, size: 12, space: 4 } },
                spacing: { after: 200 }
            })
        );

        // 4. Article Type & Title
        frontMatterChildren.push(
            new Paragraph({ children: [new TextRun({ text: "Original Research Article", italics: true, font: "Georgia", size: 22 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
            new Paragraph({ children: [new TextRun({ text: manuscriptData.title, bold: true, size: 28, font: "Georgia" })], alignment: AlignmentType.CENTER, spacing: { after: 300 } })
        );

        // 6. Authors (Fixed Grouping)
        const authorsParagraph = new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 } });
        manuscriptData.authors.forEach((a, i) => {
            const cleanName = a.name.replace(/[0-9]+$/, ''); 
            authorsParagraph.addChildElement(new TextRun({ text: cleanName, bold: true, size: 22, font: "Georgia" }));
            const affIdx = getAffiliationIndex(a.affiliation);
            authorsParagraph.addChildElement(new TextRun({ text: `${affIdx}${a.email ? '*' : ''}`, superScript: true, size: 18, font: "Georgia" }));
            if(i < manuscriptData.authors.length - 1) {
                authorsParagraph.addChildElement(new TextRun({ text: ", ", bold: true, size: 22, font: "Georgia" }));
            }
        });
        frontMatterChildren.push(authorsParagraph);

        // 7. Affiliations (Unique List)
        uniqueAffiliations.forEach((aff, i) => {
             frontMatterChildren.push(
                new Paragraph({
                    children: [
                         new TextRun({ text: `${i+1} `, superScript: true, size: 16 }),
                         new TextRun({ text: aff, italics: true, size: 18, font: "Georgia" })
                    ],
                    alignment: AlignmentType.CENTER,
                })
            );
        });
        const corresp = manuscriptData.authors.find(a => a.email);
        if(corresp) {
            frontMatterChildren.push(
                new Paragraph({
                    children: [new TextRun({ text: `*Correspondence: ${corresp.email}`, size: 16, font: "Arial" })],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 400 }
                })
            );
        } else {
             frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 400 } }));
        }

        // 8. Abstract
        const abstractTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.SINGLE, size: 18, color: journalBlue }, bottom: { style: BorderStyle.SINGLE, size: 6, color: journalBlue }, right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" }, left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE },
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            shading: { fill: "F9FAFB", type: ShadingType.CLEAR },
                            children: [
                                new Paragraph({ children: [new TextRun({ text: "ABSTRACT", bold: true, color: journalBlue, font: "Arial", size: 20 })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 200 } }),
                                new Paragraph({ children: [new TextRun({ text: manuscriptData.abstract, font: "Georgia", size: 20 })], alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 } }),
                                new Paragraph({ children: [new TextRun({ text: "Keywords: ", bold: true, font: "Georgia", size: 20 }), new TextRun({ text: manuscriptData.keywords.join("; "), font: "Georgia", size: 20 })], spacing: { after: 100 } })
                            ],
                            margins: { top: 200, bottom: 200, left: 200, right: 200 } 
                        })
                    ]
                })
            ]
        });
        frontMatterChildren.push(abstractTable);
        frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));

        // 9. Dates, Citation, Access
        frontMatterChildren.push(new Paragraph({ children: [new TextRun({ text: "Received: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${manuscriptData.receivedDate} | `, font: "Arial", size: 16 }), new TextRun({ text: "Accepted: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${manuscriptData.acceptedDate} | `, font: "Arial", size: 16 }), new TextRun({ text: "Published: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${manuscriptData.publishedDate}`, font: "Arial", size: 16 })], alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, space: 1, color: "DDDDDD" } }, spacing: { before: 200, after: 200 } }));
        const citationAuthors = manuscriptData.authors.length > 2 ? `${manuscriptData.authors[0].name} et al.` : manuscriptData.authors.map(a => a.name).join(' & ');
        const citationTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 24, color: journalBlue }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } }, rows: [ new TableRow({ children: [ new TableCell({ shading: { fill: "F0F9FF", type: ShadingType.CLEAR }, children: [ new Paragraph({ children: [ new TextRun({ text: "Cite this article: ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: `${citationAuthors} (${manuscriptData.year}). ${manuscriptData.title}. `, font: "Georgia", size: 16 }), new TextRun({ text: "Journal of Biomedical Sciences and Health", italics: true, font: "Georgia", size: 16 }), new TextRun({ text: `, ${manuscriptData.volume}(${manuscriptData.issue}), ${manuscriptData.pages}. https://doi.org/${manuscriptData.doi}`, font: "Georgia", size: 16 }) ], alignment: AlignmentType.JUSTIFIED }) ], margins: { left: 100, right: 100, top: 100, bottom: 100 } }) ] }) ] });
        frontMatterChildren.push(citationTable);
        frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        let unlockIconRun: any = new Paragraph(""); try { const { data: unlockBuffer, extension: unlockExt } = await getImageBuffer(UNLOCK_ICON_URL); unlockIconRun = new ImageRun({ data: new Uint8Array(unlockBuffer), transformation: { width: 15, height: 15 }, type: unlockExt }); } catch(e) { console.warn("Unlock icon fetch failed", e); }
        const openAccessBoxTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, bottom: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, left: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, right: { style: BorderStyle.SINGLE, color: "CCCCCC", size: 2 }, insideVertical: { style: BorderStyle.NONE } }, rows: [ new TableRow({ children: [ new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [ new Paragraph({ children: [unlockIconRun], alignment: AlignmentType.CENTER }) ], verticalAlign: VerticalAlign.CENTER, shading: { fill: "F3F4F6", type: ShadingType.CLEAR } }), new TableCell({ width: { size: 95, type: WidthType.PERCENTAGE }, children: [ new Paragraph({ children: [ new TextRun({ text: "Open Access. ", bold: true, color: journalBlue, font: "Arial", size: 16 }), new TextRun({ text: "This article is an open access article distributed under the terms and conditions of the Creative Commons Attribution 4.0 International License (CC BY 4.0).", font: "Arial", size: 16 }) ], alignment: AlignmentType.JUSTIFIED }) ], margins: { top: 100, bottom: 100, left: 100, right: 100 }, verticalAlign: VerticalAlign.CENTER }) ] }) ] });
        frontMatterChildren.push(openAccessBoxTable);
        frontMatterChildren.push(new Paragraph({ text: "", spacing: { after: 400 } }));

        // --- BODY with Inline Figures ---
        const placedFigures = new Set<string>();

        for (const section of manuscriptData.sections) {
            bodyChildren.push(new Paragraph({ children: [new TextRun({ text: section.heading, bold: true, color: "000000", font: "Arial", size: 22 })], heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 100 } }));
            
            // Split content into paragraphs to inject figures between them
            const paragraphs = stripHtmlToText(section.content).split(/\n\n+/);
            
            for (const paraText of paragraphs) {
                if (!paraText.trim()) continue;

                // MAIN BODY PARAGRAPHS - Add First Line Indent (1cm ~ 567 twips)
                bodyChildren.push(new Paragraph({ 
                    children: [new TextRun({ text: paraText, font: "Georgia", size: 21 })], 
                    alignment: AlignmentType.JUSTIFIED, 
                    spacing: { after: 200 },
                    indent: { firstLine: 567 } // 1cm Indent
                }));

                // Check for Figure matches (e.g., "Figure 1") in this paragraph
                const regex = /(?:Figure|Fig\.?)\s*(\d+)/gi;
                let match;
                while ((match = regex.exec(paraText)) !== null) {
                    const figId = match[1];
                    if (!placedFigures.has(figId)) {
                        const fig = manuscriptData.figures.find(f => f.id === figId);
                        if (fig) {
                             placedFigures.add(figId);
                             
                             let figRun: any = new TextRun(`[Image: ${fig.caption}]`);
                             try {
                                  const { data: buf, extension: figExt } = await getImageBuffer(fig.fileUrl);
                                  figRun = new ImageRun({ 
                                      data: new Uint8Array(buf), 
                                      transformation: { width: 300, height: 300 },
                                      type: figExt
                                  });
                             } catch(e) { console.error(e) }
                             
                             bodyChildren.push(new Paragraph({ children: [figRun], alignment: AlignmentType.CENTER, spacing: { before: 100 } }));
                             bodyChildren.push(new Paragraph({ children: [ new TextRun({ text: `Figure ${fig.id}: `, bold: true, color: journalBlue, font: "Arial", size: 18 }), new TextRun({ text: fig.caption, font: "Arial", size: 18 }) ], alignment: AlignmentType.CENTER, spacing: { before: 50, after: 300 } }));
                        }
                    }
                }
            }
        }

        // Remaining Figures (Fallback)
        const remainingFigures = manuscriptData.figures.filter(f => !placedFigures.has(f.id));
        if (remainingFigures.length > 0) {
            bodyChildren.push(new Paragraph({ children: [new TextRun({ text: "ADDITIONAL FIGURES", bold: true, font: "Arial", size: 22 })], spacing: { before: 400, after: 200 } }));
            for (const fig of remainingFigures) {
                let figRun: any = new TextRun(`[Image: ${fig.caption}]`);
                try {
                     const { data: buf, extension: figExt } = await getImageBuffer(fig.fileUrl);
                     figRun = new ImageRun({ 
                         data: new Uint8Array(buf), 
                         transformation: { width: 300, height: 300 },
                         type: figExt
                     });
                } catch(e) { console.error(e) }
                bodyChildren.push( new Paragraph({ children: [figRun], alignment: AlignmentType.CENTER, spacing: { before: 100 } }), new Paragraph({ children: [ new TextRun({ text: `Figure ${fig.id}: `, bold: true, color: journalBlue, font: "Arial", size: 18 }), new TextRun({ text: fig.caption, font: "Arial", size: 18 }) ], alignment: AlignmentType.CENTER, spacing: { before: 50, after: 300 } }) );
            }
        }

        // References
        bodyChildren.push( new Paragraph({ children: [new TextRun({ text: "REFERENCES", bold: true, font: "Arial", size: 22 })], heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, border: { top: { style: BorderStyle.SINGLE, size: 6 } } }) );
        manuscriptData.references.forEach((ref) => {
             // Hanging indent for APA - FIXED for DOCX clipping
             // Indent entire block left by 0.5in (720), then pull first line back by 0.5in (-720)
             bodyChildren.push( new Paragraph({ 
                 children: [new TextRun({ text: ref, font: "Georgia", size: 18 })], 
                 alignment: AlignmentType.JUSTIFIED, 
                 spacing: { after: 100 },
                 indent: { left: 720, hanging: 720 } 
            }) );
        });

        // --- FOOTERS/HEADERS ---
        const footerPage1 = new Footer({ children: [ new Paragraph({ children: [] }) ] });
        const footerDefault = new Footer({
            children: [
                new Paragraph({ children: [new TextRun({ text: "Journal of Biomedical Sciences and Health", bold: true, font: "Arial", size: 16 })], alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 6, space: 4 } }, spacing: { before: 100 } }),
                new Paragraph({ children: [new TextRun({ text: `Copyright © ${manuscriptData.year} The Author(s). Published by Universitas Karya Husada Semarang, Indonesia`, font: "Arial", size: 16 })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT], bold: true, size: 20, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { before: 100 } })
            ]
        });

        const runningHeadLeft = manuscriptData.authors.length > 2 ? `${manuscriptData.authors[0].name.split(' ').pop()} et al.` : manuscriptData.authors.map(a => a.name.split(' ').pop()).join(' & ');
        const runningHeadRight = `J. Biomed. Sci. Health. ${manuscriptData.year}; ${manuscriptData.volume}(${manuscriptData.issue}): ${manuscriptData.pages}`;
        const runningHeaderTable = new Table({
             width: { size: 100, type: WidthType.PERCENTAGE },
             borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE },
             },
             rows: [ new TableRow({ children: [ new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: runningHeadLeft, italics: true, font: "Arial", size: 16 })], alignment: AlignmentType.LEFT })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: runningHeadRight, font: "Arial", size: 16 })], alignment: AlignmentType.RIGHT })] }) ] }) ]
        });
        const headerDefault = new Header({ children: [runningHeaderTable, new Paragraph({text: "", spacing: {after: 200}})] });

        const doc = new Document({
            sections: [
                {
                    properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: "2.5cm", bottom: "2.5cm", left: "2.5cm", right: "2.5cm" } } },
                    children: frontMatterChildren,
                    headers: { default: new Header({ children: [] }) },
                    footers: { default: footerPage1 }
                },
                {
                    properties: { column: { count: 2, space: 400 }, type: SectionType.CONTINUOUS },
                    children: bodyChildren,
                    headers: { default: headerDefault },
                    footers: { default: footerDefault }
                }
            ]
        });

        const blob = await Packer.toBlob(doc);
        FileSaver.saveAs(blob, "JBSH_Manuscript.docx");

    } catch (err) {
        console.error("Docx generation failed", err);
        alert("Failed to generate DOCX file. Please check console for details.");
    } finally {
        setIsDownloading(false);
    }
  };

  const handleUpdateField = <K extends keyof ManuscriptData>(field: K, value: ManuscriptData[K]) => { if (!manuscriptData) return; setManuscriptData({ ...manuscriptData, [field]: value }); };
  const handleUpdateSection = (index: number, newContent: string) => { if (!manuscriptData) return; const newSections = [...manuscriptData.sections]; newSections[index].content = newContent; setManuscriptData({ ...manuscriptData, sections: newSections }); };
  const handleUpdateFigureOrder = (index: number, direction: 'up' | 'down') => { if (!manuscriptData) return; const newFigures = [...manuscriptData.figures]; if (direction === 'up' && index > 0) { [newFigures[index - 1], newFigures[index]] = [newFigures[index], newFigures[index - 1]]; } else if (direction === 'down' && index < newFigures.length - 1) { [newFigures[index + 1], newFigures[index]] = [newFigures[index], newFigures[index + 1]]; } setManuscriptData({...manuscriptData, figures: newFigures}); }
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { if (manuscriptData) { setManuscriptData({ ...manuscriptData, logoUrl: e.target?.result as string }); } }; reader.readAsDataURL(file); };
  const handleAddFigure = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !manuscriptData) return; const reader = new FileReader(); reader.onload = (e) => { const newFigure: ManuscriptFigure = { id: (manuscriptData.figures.length + 1).toString(), fileUrl: e.target?.result as string, caption: newFigCaption || `Figure ${manuscriptData.figures.length + 1}` }; setManuscriptData({ ...manuscriptData, figures: [...manuscriptData.figures, newFigure] }); setNewFigCaption(""); }; reader.readAsDataURL(file); };
  const handleRemoveFigure = (id: string) => { if (!manuscriptData) return; setManuscriptData({ ...manuscriptData, figures: manuscriptData.figures.filter(f => f.id !== id) }); };

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
                    <button onClick={() => setIsEditingPreview(!isEditingPreview)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm ${isEditingPreview ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-300" : "bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"}`}>{isEditingPreview ? <Check size={16} /> : <Edit size={16} />}{isEditingPreview ? "Done Editing" : "Edit Preview"}</button>
                    <button onClick={() => setAppState(AppState.METADATA_REVIEW)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm"><ChevronLeft size={16} />Metadata</button>
                    <button onClick={handleDownloadPDF} disabled={isDownloading} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm">{isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<Save size={16} />)}PDF</button>
                    <button onClick={handleDownloadDocx} disabled={isDownloading} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm">{isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<FileDown size={16} />)}Docx</button>
                    <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm"><Printer size={16} />Print</button>
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
                    {error && (<div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-3 border border-red-200"><AlertCircle size={20} />{error}</div>)}
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors group relative cursor-pointer">
                        <div className="flex flex-col items-center gap-4 relative z-0"><div className="p-4 bg-sky-50 text-[#007398] rounded-full group-hover:scale-110 transition-transform"><Upload size={32} /></div><div><h3 className="font-bold text-slate-800 text-lg">Upload Manuscript File</h3><p className="text-slate-500 text-sm mt-1">Supports .docx, .html, .txt, .md</p></div></div>
                        <input type="file" accept=".docx,.txt,.md,.html,.htm" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"/>
                    </div>
                    <div className="mt-8">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Or paste manuscript text directly:</label>
                        <textarea className="w-full h-48 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#007398] outline-none resize-none font-serif" placeholder="Paste Title, Abstract, Introduction, etc. here..." value={rawText} onChange={(e) => setRawText(e.target.value)} />
                        <button onClick={handleManualText} className="w-full mt-4 bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors flex justify-center items-center gap-2"><FileText size={18} />Process Manuscript</button>
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
                
                {/* VALIDATION SIDEBAR (LEFT) */}
                <div className="w-64 shrink-0 space-y-6 hidden lg:block">
                    <div className={`p-4 rounded-xl shadow-lg border-2 ${
                        validationStats?.status === 'success' ? 'bg-green-50 border-green-200' :
                        validationStats?.status === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'
                    }`}>
                        <div className="flex items-center gap-2 mb-3 border-b border-black/10 pb-2">
                            <FileSearch size={20} className={validationStats?.status === 'success' ? 'text-green-600' : validationStats?.status === 'warning' ? 'text-yellow-600' : 'text-red-600'} />
                            <h3 className="font-bold text-sm text-slate-800">Quality Check</h3>
                        </div>
                        
                        {validationStats ? (
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-slate-500 uppercase font-bold">Content Match</p>
                                    <div className="flex items-end gap-2">
                                        <span className={`text-2xl font-bold ${
                                            validationStats.status === 'success' ? 'text-green-700' : 
                                            validationStats.status === 'warning' ? 'text-yellow-700' : 'text-red-700'
                                        }`}>{validationStats.coveragePercent}%</span>
                                        <span className="text-xs text-slate-500 mb-1">of significant words found</span>
                                    </div>
                                    <div className="w-full bg-white h-2 rounded-full mt-1 border border-slate-100 overflow-hidden">
                                        <div className={`h-full rounded-full ${
                                            validationStats.status === 'success' ? 'bg-green-500' : 
                                            validationStats.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                                        }`} style={{width: `${validationStats.coveragePercent}%`}}></div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-white p-2 rounded border border-slate-100">
                                        <p className="text-slate-400">Original</p>
                                        <p className="font-bold text-slate-700">{validationStats.originalWordCount} words</p>
                                    </div>
                                    <div className="bg-white p-2 rounded border border-slate-100">
                                        <p className="text-slate-400">Generated</p>
                                        <p className="font-bold text-slate-700">{validationStats.generatedWordCount} words</p>
                                    </div>
                                </div>

                                <div className={`text-xs p-2 rounded border flex gap-2 items-start ${
                                    validationStats.status === 'success' ? 'bg-green-100 text-green-800 border-green-200' : 
                                    validationStats.status === 'warning' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-red-100 text-red-800 border-red-200'
                                }`}>
                                    {validationStats.status === 'success' ? <CheckCircle size={14} className="mt-0.5 shrink-0"/> : <AlertTriangle size={14} className="mt-0.5 shrink-0"/>}
                                    <p>
                                        {validationStats.status === 'success' ? "Excellent integrity. Most content preserved." :
                                         validationStats.status === 'warning' ? "Good match, but check for missing paragraphs." :
                                         "Significant content loss detected. Please review manually."}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400">Analyzing content...</p>
                        )}
                    </div>
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
          <div className="flex justify-center">
            <div className="w-full max-w-none flex justify-center" id="printable-content">
                <LayoutPreview 
                    data={manuscriptData} 
                    isEditable={isEditingPreview}
                    onUpdateField={handleUpdateField}
                    onUpdateSection={handleUpdateSection}
                    onUpdateFigureOrder={handleUpdateFigureOrder}
                    onRemoveFigure={handleRemoveFigure}
                />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
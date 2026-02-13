import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ManuscriptData, AppState, ManuscriptFigure } from './types';
import { parseManuscript, createManualManuscript } from './services/geminiService';
import { LayoutPreview } from './components/LayoutPreview';
import { LoaTemplate } from './components/LoaTemplate';
import { Upload, FileText, Printer, ChevronLeft, RefreshCw, AlertCircle, ArrowRight, Image as ImageIcon, Plus, Trash2, FileDown, Edit, Check, Save, LogIn, User, LogOut, Home, FileSearch, Info, AlertTriangle, CheckCircle, SearchX, ZapOff, FileSignature, Mail, Settings, X, Send, Layout, FileType, ExternalLink } from 'lucide-react';
import mammoth from 'mammoth';
import FileSaver from "file-saver";
import emailjs from '@emailjs/browser';
import * as docx from 'docx';

// Default JBSH Logo from user request
const DEFAULT_LOGO_URL = "https://i.ibb.co.com/84Q0yL5/jbsh-logo.jpg";

// --- EMAILJS CONFIGURATION ---
const EMAIL_DEFAULTS = {
    SERVICE_ID: "service_l0d7noh", 
    TEMPLATE_ID: "template_dy9hdom", 
    PUBLIC_KEY: "BBQB5tdjg4Hjlc-KZ"
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
    coveragePercent: number; 
    status: 'success' | 'warning' | 'danger';
    missingSections: string[];
    formattingIssues: string[];
}

interface EmailConfig {
    serviceId: string;
    templateId: string;
    publicKey: string;
}

const App: React.FC = () => {
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
  
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
      serviceId: localStorage.getItem('jbsh_email_service_id') || EMAIL_DEFAULTS.SERVICE_ID,
      templateId: localStorage.getItem('jbsh_email_template_id') || EMAIL_DEFAULTS.TEMPLATE_ID,
      publicKey: localStorage.getItem('jbsh_email_public_key') || EMAIL_DEFAULTS.PUBLIC_KEY
  });

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [currentUser, setCurrentUser] = useState<string>("");

  const [newFigCaption, setNewFigCaption] = useState("");

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
    setCurrentUser(loginEmail);
    setAppState(AppState.UPLOAD);
    setPreviewTab('manuscript');
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

  const runValidation = (original: string, generated: ManuscriptData) => {
      const getWords = (text: string) => {
          return text
            .replace(/<[^>]*>/g, ' ') 
            .replace(/\[FIGURE REMOVED\]/g, ' ') 
            .replace(/&nbsp;/g, ' ')
            .replace(/[^\w\s]/g, '') 
            .replace(/\s+/g, ' ') 
            .trim()
            .toLowerCase()
            .split(' ')
            .filter(w => w.length > 2); 
      };

      const originalWords = getWords(original);
      const generatedContent = [
          generated.title,
          generated.abstract,
          ...generated.keywords,
          ...generated.sections.map(s => s.content),
          ...generated.references
      ].join(' ');
      
      const generatedWords = getWords(generatedContent);
      const generatedWordSet = new Set(generatedWords);
      const origCount = originalWords.length;
      const genCount = generatedWords.length;

      let foundCount = 0;
      originalWords.forEach(w => {
          if (generatedWordSet.has(w)) foundCount++;
      });
      
      const coverage = origCount > 0 ? Math.round((foundCount / origCount) * 100) : 0;
      const adjustedCoverage = Math.min(100, coverage); 

      const requiredSections = ['Introduction', 'Method', 'Result', 'Discussion', 'Conclusion'];
      const currentHeadings = generated.sections.map(s => s.heading.toLowerCase());
      const missingSections = requiredSections.filter(req => 
          !currentHeadings.some(h => h.includes(req.toLowerCase()))
      );

      const formattingIssues: string[] = [];
      if (generatedContent.includes("Error! Reference source not found")) {
          formattingIssues.push("Found 'Error! Reference source' artifact.");
      }
      if (/\[\s*(?:insert|figure|table).*\]/i.test(generatedContent)) {
          formattingIssues.push("Potential placeholder text detected.");
      }

      let status: 'success' | 'warning' | 'danger' = 'success';
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

  // Helper to strictly clean HTML for AI (Removes Base64 Images)
  const cleanHtmlForTokenOptimization = (html: string): string => {
      // 1. Remove all <img> tags completely
      let clean = html.replace(/<img[^>]*>/gi, '[FIGURE REMOVED]');
      
      // 2. Remove all inline style attributes (often contain massive data URIs or complex Word styles)
      clean = clean.replace(/ style="[^"]*"/gi, '');
      
      // 3. Remove class attributes (often verbose Word classes)
      clean = clean.replace(/ class="[^"]*"/gi, '');

      // 4. Remove comments
      clean = clean.replace(/<!--[\s\S]*?-->/g, '');

      // 5. Remove empty tags often left by converters
      clean = clean.replace(/<span[^>]*>\s*<\/span>/gi, '');
      
      return clean;
  };

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
           
           // Extract images for UI, but remove from Text sent to AI
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

           // AGGRESSIVE CLEANING FOR AI INPUT
           const optimizedText = cleanHtmlForTokenOptimization(fullHtml);
           setRawText(optimizedText);
           processManuscript(optimizedText, extractedFigures);

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

         const optimizedText = cleanHtmlForTokenOptimization(text);
         setRawText(optimizedText);
         processManuscript(optimizedText, extractedFigures);
       };
       reader.readAsText(file);
    } else {
       const reader = new FileReader();
       reader.onload = async (e) => {
         const text = e.target?.result as string;
         // Clean plain text too just in case of weird characters
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
     setTimeout(() => {
         const data = createManualManuscript(rawText);
         if (!data.logoUrl || data.logoUrl.includes('placeholder')) {
             data.logoUrl = DEFAULT_LOGO_URL;
         }
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

  const handleDownloadDocx = () => {
        if (!manuscriptData) return;
        setIsDownloading(true);

        const doc = new docx.Document({
            sections: [{
                properties: {},
                children: [
                    new docx.Paragraph({
                        text: manuscriptData.title,
                        heading: docx.HeadingLevel.HEADING_1,
                        alignment: docx.AlignmentType.CENTER,
                    }),
                    new docx.Paragraph({ text: "" }),
                    ...manuscriptData.authors.map(author => new docx.Paragraph({
                        children: [
                            new docx.TextRun({ text: author.name, bold: true }),
                            new docx.TextRun({ text: `, ${author.affiliation}`, italics: true })
                        ],
                        alignment: docx.AlignmentType.CENTER,
                    })),
                    new docx.Paragraph({ text: "" }),
                    new docx.Paragraph({
                        children: [new docx.TextRun({ text: "Abstract", bold: true })],
                        alignment: docx.AlignmentType.CENTER,
                    }),
                    new docx.Paragraph({
                        text: manuscriptData.abstract.replace(/<[^>]*>/g, ''), // Strip HTML for DOCX
                        alignment: docx.AlignmentType.JUSTIFIED,
                    }),
                    new docx.Paragraph({
                        children: [
                            new docx.TextRun({ text: "Keywords: ", bold: true }),
                            new docx.TextRun({ text: manuscriptData.keywords.join(", ") })
                        ]
                    }),
                    new docx.Paragraph({ text: "" }),
                    ...manuscriptData.sections.flatMap(section => [
                        new docx.Paragraph({
                            text: section.heading,
                            heading: docx.HeadingLevel.HEADING_2,
                            spacing: { before: 200, after: 100 }
                        }),
                        // Simple split by newline for paragraphs to avoid giant blocks
                        ...section.content.replace(/<[^>]*>/g, '\n').split('\n').filter(p => p.trim()).map(p => new docx.Paragraph({
                            text: p.trim(),
                            alignment: docx.AlignmentType.JUSTIFIED,
                            indent: { firstLine: 720 } // approx 1cm
                        }))
                    ]),
                    new docx.Paragraph({
                        text: "References",
                        heading: docx.HeadingLevel.HEADING_2,
                        spacing: { before: 200, after: 100 }
                    }),
                    ...manuscriptData.references.map(ref => new docx.Paragraph({
                        text: ref,
                        hanging: 720 // Hanging indent for references
                    }))
                ]
            }]
        });

        docx.Packer.toBlob(doc).then((blob) => {
            FileSaver.saveAs(blob, `JBSH_Manuscript_${manuscriptData.year}.docx`);
            setIsDownloading(false);
        });
  };

  const getLoAPDFBlob = async (): Promise<Blob | null> => {
      const element = document.getElementById('loa-hidden-template');
      if (!element || !window.html2pdf) return null;
      const opt = {
        margin: 0, 
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true,
            letterRendering: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794 
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
            windowWidth: 794
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
    
    if (!emailConfig.serviceId || !emailConfig.publicKey || !emailConfig.templateId) {
        const confirmSetup = window.confirm(
            "EmailJS is not configured. Do you want to use the default email client (manual attachment) instead?"
        );
        
        if (confirmSetup) {
             handleDownloadLoA();
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
        const pdfBlob = await getLoAPDFBlob();
        if (!pdfBlob) throw new Error("Failed to generate PDF");

        const reader = new FileReader();
        reader.readAsDataURL(pdfBlob);
        reader.onloadend = async () => {
            const base64data = reader.result as string; 
            const templateParams = {
                to_email: manuscriptData.authors.find(a => a.email)?.email || "",
                to_name: manuscriptData.authors[0].name,
                article_title: manuscriptData.title,
                loa_attachment: base64data 
            };
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
                if (err.status === 413 || (err.text && err.text.includes("size limit"))) {
                    const proceed = window.confirm(
                        "File is too large for the free email server (Limit 50KB).\n\nSwitching to manual mode: Proceed?"
                    );
                    if (proceed) {
                         FileSaver.saveAs(pdfBlob, `LoA_JBSH_${manuscriptData.authors[0]?.name.split(' ').pop()}.pdf`);
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

  const handleUpdateField = <K extends keyof ManuscriptData>(field: K, value: ManuscriptData[K]) => { if (!manuscriptData) return; setManuscriptData({ ...manuscriptData, [field]: value }); };
  const handleUpdateSection = (index: number, newContent: string) => { if (!manuscriptData) return; const newSections = [...manuscriptData.sections]; newSections[index].content = newContent; setManuscriptData({ ...manuscriptData, sections: newSections }); };
  const handleUpdateFigureOrder = (index: number, direction: 'up' | 'down') => { if (!manuscriptData) return; const newFigures = [...manuscriptData.figures]; if (direction === 'up' && index > 0) { [newFigures[index - 1], newFigures[index]] = [newFigures[index], newFigures[index - 1]]; } else if (direction === 'down' && index < newFigures.length - 1) { [newFigures[index + 1], newFigures[index]] = [newFigures[index], newFigures[index - 1]]; } setManuscriptData({...manuscriptData, figures: newFigures}); }
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { if (manuscriptData) { setManuscriptData({ ...manuscriptData, logoUrl: e.target?.result as string }); } }; reader.readAsDataURL(file); };
  const handleAddFigure = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !manuscriptData) return; const reader = new FileReader(); reader.onload = (e) => { const newFigure: ManuscriptFigure = { id: (manuscriptData.figures.length + 1).toString(), fileUrl: e.target?.result as string, caption: newFigCaption || `Figure ${manuscriptData.figures.length + 1}` }; setManuscriptData({ ...manuscriptData, figures: [...manuscriptData.figures, newFigure] }); setNewFigCaption(""); }; reader.readAsDataURL(file); };
  const handleRemoveFigure = (id: string) => { if (!manuscriptData) return; setManuscriptData({ ...manuscriptData, figures: manuscriptData.figures.filter(f => f.id !== id) }); };

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
              <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full pl-3 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083B0] outline-none" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full pl-3 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0083B0] outline-none" required />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-[#0083B0] to-[#00B4DB] text-white py-2.5 rounded-lg font-bold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 mt-2">Sign In</button>
          </form>
          <div className="mt-6 text-center text-xs text-slate-400 border-t pt-4">&copy; {new Date().getFullYear()} Journal of Biomedical Sciences and Health</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans-journal">
      <nav className="bg-gradient-to-r from-[#0083B0] to-[#00B4DB] text-white p-4 shadow-md no-print sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <button onClick={handleGoHome} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors mr-2 flex items-center justify-center border border-white/20" title="Home / Dashboard">
                <Home size={20} />
             </button>
            <div className="bg-white text-[#0083B0] px-2 py-1 rounded font-bold text-xl tracking-tight shadow-sm border border-blue-200">JBSH</div>
            <h1 className="text-lg font-semibold tracking-wide hidden sm:block">Editor Assistant Tool (Auto-Pilot)</h1>
          </div>
          <div className="flex items-center gap-2">
             {appState === AppState.PREVIEW && (
                 <>
                    <div className="flex bg-white/20 rounded-md p-0.5 mr-2">
                        <button onClick={() => setPreviewTab('manuscript')} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${previewTab === 'manuscript' ? 'bg-white text-[#0083B0] shadow-sm' : 'text-white hover:bg-white/10'}`}><Layout size={16} /> Manuscript</button>
                        <button onClick={() => setPreviewTab('loa')} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${previewTab === 'loa' ? 'bg-white text-[#0083B0] shadow-sm' : 'text-white hover:bg-white/10'}`}><FileSignature size={16} /> LoA</button>
                    </div>

                    {previewTab === 'manuscript' ? (
                        <>
                            <button onClick={() => setIsEditingPreview(!isEditingPreview)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm ${isEditingPreview ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-300" : "bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm"}`}>{isEditingPreview ? <Check size={16} /> : <Edit size={16} />}{isEditingPreview ? "Done Editing" : "Edit"}</button>
                            <button onClick={() => setAppState(AppState.METADATA_REVIEW)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-white/20 hover:bg-white/30 text-white transition-colors backdrop-blur-sm"><ChevronLeft size={16} />Meta</button>
                            <button onClick={handleDownloadPDF} disabled={isDownloading} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm">{isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<Save size={16} />)}PDF</button>
                            <button onClick={handleDownloadDocx} disabled={isDownloading} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm">{isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<FileType size={16} />)}DOCX</button>
                        </>
                    ) : (
                        <div className="flex items-center bg-emerald-700/50 rounded-md p-0.5 ml-2 border border-emerald-500/50">
                            <button onClick={handleDownloadLoA} disabled={isDownloading} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors shadow-sm mr-0.5">
                                {isDownloading ? (<div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>) : (<FileSignature size={16} />)} PDF
                            </button>
                            <button onClick={handleEmailLoA} disabled={isSendingEmail} className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors shadow-sm">
                                {isSendingEmail ? <div className="animate-spin h-3 w-3 border-2 border-white rounded-full border-t-transparent"></div> : <Mail size={16} />} Email
                            </button>
                        </div>
                    )}
                    <button onClick={() => setShowEmailSettings(true)} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-md transition-colors ml-1"><Settings size={18} /></button>
                    {previewTab === 'manuscript' && (<button onClick={handlePrint} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors shadow-sm ml-2"><Printer size={16} />Print</button>)}
                 </>
             )}
            {appState !== AppState.UPLOAD && appState !== AppState.PROCESSING && (<button onClick={() => { setAppState(AppState.UPLOAD); setManuscriptData(null); setRawText(''); }} className="text-white/80 hover:text-white" title="Start Over"><RefreshCw size={18} /></button>)}
            <div className="h-6 w-px bg-white/30 mx-2"></div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium hidden md:inline-block opacity-90">{currentUser}</span>
              <button onClick={handleLogout} className="bg-white/10 hover:bg-white/20 p-1.5 rounded text-white transition-colors" title="Logout"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow p-4 md:p-8">
        {showEmailSettings && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center p-4 border-b">
                        <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} className="text-slate-500"/> Email Configuration</h3>
                        <button onClick={() => setShowEmailSettings(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div className="bg-slate-50 p-4 rounded text-sm mb-4 border border-slate-200">
                            <h4 className="font-bold mb-2 flex items-center gap-2"><Info size={16} className="text-blue-500"/> EmailJS Setup:</h4>
                            <p className="text-xs text-slate-600">Enter your Service ID, Template ID, and Public Key from EmailJS dashboard.</p>
                        </div>
                        <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Service ID</label><input type="text" value={emailConfig.serviceId} onChange={e => setEmailConfig({...emailConfig, serviceId: e.target.value})} className="w-full border p-2 rounded text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Template ID</label><input type="text" value={emailConfig.templateId} onChange={e => setEmailConfig({...emailConfig, templateId: e.target.value})} className="w-full border p-2 rounded text-sm" /></div>
                        <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Public Key</label><input type="text" value={emailConfig.publicKey} onChange={e => setEmailConfig({...emailConfig, publicKey: e.target.value})} className="w-full border p-2 rounded text-sm" /></div>
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
                    <div className="inline-block bg-white text-[#0083B0] px-4 py-2 rounded-lg font-bold text-4xl tracking-tight shadow-lg border-2 border-white/20 mb-4">JBSH</div>
                    <h2 className="text-2xl font-bold mb-2">Manuscript Generator (Auto-Pilot)</h2>
                    <p className="opacity-90">Auto-switching between Gemini Flash (Fast) and Pro (Detail) for stability.</p>
                </div>
                <div className="p-8">
                    {error && (
                        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex flex-col gap-2 border border-red-200">
                             <div className="flex items-center gap-3"><AlertCircle size={20} /> <span className="font-bold">Error:</span> {error}</div>
                             <div className="pl-8 text-sm">
                                 <button onClick={handleManualProcessing} className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded font-bold text-xs hover:bg-red-50 transition-colors flex items-center gap-2 inline-flex"><ZapOff size={14} /> Switch to Manual Mode</button>
                             </div>
                        </div>
                    )}
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center hover:bg-slate-50 transition-colors group relative cursor-pointer">
                        <div className="flex flex-col items-center gap-4 relative z-0"><div className="p-4 bg-sky-50 text-[#007398] rounded-full group-hover:scale-110 transition-transform"><Upload size={32} /></div><div><h3 className="font-bold text-slate-800 text-lg">Upload Manuscript File</h3><p className="text-slate-500 text-sm mt-1">Supports .docx, .html, .txt</p></div></div>
                        <input type="file" accept=".docx,.txt,.html,.htm" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"/>
                    </div>
                    <div className="mt-8">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Or paste manuscript text:</label>
                        <textarea className="w-full h-48 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#007398] outline-none resize-none font-serif" placeholder="Paste Title, Abstract, Introduction, etc. here..." value={rawText} onChange={(e) => setRawText(e.target.value)} />
                        <div className="flex gap-3 mt-4">
                            <button onClick={handleManualText} className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors flex justify-center items-center gap-2"><FileText size={18} /> Process with AI</button>
                            <button onClick={handleManualProcessing} className="flex-1 bg-white text-slate-700 border border-slate-300 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors flex justify-center items-center gap-2"><ZapOff size={18} /> Skip AI (Manual)</button>
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
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Analyzing Manuscript...</h2><p className="text-slate-500 max-w-md">Optimizing with Gemini 3 Flash / Pro...</p>
          </div>
        )}

        {appState === AppState.METADATA_REVIEW && manuscriptData && (
             <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 no-print flex gap-6">
                <div className="w-64 shrink-0 space-y-6 hidden lg:block">{renderQualityControlSidebar()}</div>
                <div className="flex-1 bg-white shadow-xl rounded-xl overflow-hidden">
                    <div className="bg-slate-800 p-6 text-white flex justify-between items-center sticky top-0 z-40"><div><h2 className="text-2xl font-bold">Metadata & Assets Review</h2><p className="opacity-80 text-sm">Verify details and upload figures.</p></div><div className="bg-[#00B4DB] px-4 py-1.5 rounded-full text-xs font-bold tracking-wide">JBSH EDITOR</div></div>
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
                            <h3 className="font-bold text-slate-800 border-b pb-2 mb-4 flex items-center gap-2"><ImageIcon size={18} className="text-[#00B4DB]" /> Figures</h3>
                            <div className="bg-slate-50 p-4 rounded-lg border border-dashed border-slate-300">
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Add New Figure</label>
                                <input type="text" placeholder="Figure Caption" className="w-full border p-2 rounded text-sm mb-2" value={newFigCaption} onChange={(e) => setNewFigCaption(e.target.value)}/>
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
                            <div className="mt-8 pt-8 border-t"><button onClick={() => setAppState(AppState.PREVIEW)} className="w-full bg-[#0083B0] text-white py-3 rounded-lg font-bold hover:bg-[#007299] transition-colors flex items-center justify-center gap-2 shadow-lg text-lg">Generate Layout <ArrowRight size={20} /></button><button onClick={() => setAppState(AppState.UPLOAD)} className="w-full mt-3 py-2 text-slate-500 text-sm hover:text-slate-700">Cancel</button></div>
                        </div>
                    </div>
                </div>
             </div>
        )}

        {appState === AppState.PREVIEW && manuscriptData && (
          <div className="max-w-[1600px] mx-auto flex items-start gap-8 justify-center p-4">
             <div className="w-72 shrink-0 space-y-6 hidden xl:block no-print sticky top-24">{renderQualityControlSidebar()}</div>
             <div className="flex-1 flex justify-center min-w-0" id="printable-content">
                {previewTab === 'manuscript' ? (
                    <div className="w-full flex justify-center"><LayoutPreview data={manuscriptData} isEditable={isEditingPreview} onUpdateField={handleUpdateField} onUpdateSection={handleUpdateSection} onUpdateFigureOrder={handleUpdateFigureOrder} onRemoveFigure={handleRemoveFigure} /></div>
                ) : (
                    <div className="w-full flex justify-center"><div className="w-full max-w-[210mm] bg-white shadow-2xl min-h-[297mm]"><LoaTemplate data={manuscriptData} isEditable={true} onUpdate={(field, value) => handleUpdateField(field, value as any)} /></div></div>
                )}
             </div>
          </div>
        )}

        {manuscriptData && (<div className="absolute top-[-9999px] left-[-9999px]"><div id="loa-hidden-template" style={{ width: '210mm', minHeight: '297mm' }}><LoaTemplate data={manuscriptData} isEditable={false} /></div></div>)}
      </main>
    </div>
  );
};

export default App;
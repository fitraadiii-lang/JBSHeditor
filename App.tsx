import React, { useState, useEffect } from 'react';
import { Printer, BookOpen, FileCheck, FileDown, Edit, Edit3, Home } from 'lucide-react';
import Editor from './components/Editor';
import ArticlePreview from './components/ArticlePreview';
import LetterOfAcceptance from './components/LetterOfAcceptance';
import { ArticleData } from './types';
import { parseRawManuscript, improveAbstract } from './services/geminiService';
import { generateDocx } from './services/docxGenerator';

const INITIAL_DATA: ArticleData = {
  title: "Effects of Regular High-Intensity Interval Training on Cardiovascular Biomarkers in Sedentary Adults",
  articleType: "Original Research",
  authors: [
    { name: "John Doe", affiliation: "Department of Cardiology, University Medical Center, Cityville", isCorresponding: true, email: "j.doe@umc.edu" },
    { name: "Jane Smith", affiliation: "Faculty of Sports Science, State University, Townsville" },
    { name: "Robert Johnson", affiliation: "Department of Cardiology, University Medical Center, Cityville" }
  ],
  abstract: "Cardiovascular diseases remain the leading cause of mortality worldwide. High-Intensity Interval Training (HIIT) has emerged as a time-efficient strategy to improve cardiorespiratory fitness. This study aimed to investigate the effects of a 12-week HIIT program on specific inflammatory and lipid biomarkers in sedentary adults. Sixty participants were randomized into HIIT and control groups. Results showed a significant reduction in LDL-C and CRP levels in the HIIT group compared to controls (p < 0.05). These findings suggest that HIIT serves as a potent non-pharmacological intervention for cardiovascular risk reduction.",
  keywords: ["HIIT", "Cardiovascular Health", "Inflammation", "Lipid Profile"],
  volume: "3",
  issue: "1",
  pages: "1-10",
  publicationYear: "2026",
  doi: "10.34310/jbsh.v3.i1.xxxx",
  receivedDate: "10 October 2025",
  revisedDate: "15 November 2025",
  acceptedDate: "20 December 2025",
  publishedDate: "19 February 2026",
  figures: [],
  content: `## 1. INTRODUCTION
Cardiovascular diseases (CVDs) are the leading cause of death globally, taking an estimated 17.9 million lives each year. Physical inactivity is a major risk factor for CVDs.

## 2. METHODS
A randomized controlled trial was conducted with 60 sedentary adults aged 30-50.

### 2.1. Intervention
The HIIT group performed 4x4 min intervals at 90% HRmax, three times per week.

## 3. RESULTS
After 12 weeks, the HIIT group showed significant improvements in VO2max (+15%) compared to the control group (+2%).

![Figure 1](figure-1)

*Figure 1: Comparison of VO2max levels between groups pre- and post-intervention.*

## 4. DISCUSSION
Our data aligns with previous studies suggesting intense exercise modulates inflammatory pathways.

## 5. REFERENCES
World Health Organization. (2021). *Cardiovascular diseases (CVDs)*. https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)

Gibala, M. J., Little, J. P., MacDonald, M. J., & Hawley, J. A. (2012). Physiological adaptations to low-volume, high-intensity interval training in health and disease. *The Journal of Physiology*, 590(5), 1077-1084. https://doi.org/10.1113/jphysiol.2011.224725`
};

const App: React.FC = () => {
  const [articleData, setArticleData] = useState<ArticleData>(INITIAL_DATA);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLoa, setShowLoa] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('jbsh_gemini_api_key');
    if (savedKey) {
      setArticleData(prev => ({ ...prev, geminiApiKey: savedKey }));
    }
  }, []);

  // Save API key to localStorage when it changes
  useEffect(() => {
    if (articleData.geminiApiKey) {
      localStorage.setItem('jbsh_gemini_api_key', articleData.geminiApiKey);
    }
  }, [articleData.geminiApiKey]);

  const handleImport = async (text: string) => {
    setIsProcessing(true);
    try {
      // We pass the existing figures to the AI so it knows how to link them in the text
      const parsedData = await parseRawManuscript(
        text, 
        articleData.figures, 
        articleData.articleType, // Pass articleType
        articleData.geminiApiKey, 
        articleData.geminiModel
      );
      setArticleData(prev => ({
        ...prev,
        ...parsedData,
        // Ensure defaults if partial data returned
        authors: (parsedData.authors && parsedData.authors.length > 0) ? parsedData.authors : prev.authors,
        keywords: (parsedData.keywords && parsedData.keywords.length > 0) ? parsedData.keywords : prev.keywords,
        // Prevent overwriting DOI if the new one is empty/null
        doi: parsedData.doi || prev.doi,
        // IMPORTANT: We do not overwrite figures here, as they are managed manually in step 1
        figures: prev.figures 
      }));
    } catch (error) {
      alert("Failed to parse manuscript. Please check your API key or try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImproveAbstract = async () => {
    setIsProcessing(true);
    try {
      const improved = await improveAbstract(
        articleData.abstract, 
        articleData.geminiApiKey, 
        articleData.geminiModel
      );
      setArticleData(prev => ({ ...prev, abstract: improved }));
    } catch (error) {
      alert("Failed to improve abstract.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDocx = async () => {
    try {
      await generateDocx(articleData);
    } catch (error) {
      console.error("DOCX Generation Failed:", error);
      alert("Failed to generate DOCX file. Please check console for details.");
    }
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to reset everything? Unsaved changes will be lost.")) {
        setArticleData(INITIAL_DATA);
        setIsEditMode(false);
        setShowLoa(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* App Header - No Print */}
      <header className="h-16 bg-brand-900 text-white flex items-center justify-between px-6 shadow-md z-10 print:hidden">
        <div className="flex items-center gap-3 cursor-pointer" onClick={handleReset}>
          <BookOpen className="text-brand-500" size={28} />
          <div>
            <h1 className="font-sans font-bold text-lg tracking-wide">JBSH Generator</h1>
            <p className="text-xs text-brand-100 opacity-80">Journal of Biomedical Sciences and Health</p>
          </div>
        </div>
        <div className="flex gap-2">
            <button 
            onClick={handleReset}
            className="flex items-center gap-2 bg-white/10 text-white px-3 py-1.5 rounded font-medium text-xs hover:bg-white/20 transition-colors mr-2 border border-white/20"
          >
            <Home size={14} />
            Home
          </button>

           <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded font-medium text-xs transition-colors border ${isEditMode ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-transparent text-white border-white/30 hover:bg-white/10'}`}
            title="Enable direct editing on the preview"
          >
            {isEditMode ? <Edit3 size={14} /> : <Edit size={14} />}
            {isEditMode ? 'Editing Enabled' : 'Edit Preview'}
          </button>

           <button 
            onClick={() => setShowLoa(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded font-medium text-xs hover:bg-green-700 transition-colors"
          >
            <FileCheck size={14} />
            LoA
          </button>
          
          <button 
            onClick={handleDownloadDocx}
            className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded font-medium text-xs hover:bg-blue-700 transition-colors"
          >
            <FileDown size={14} />
            DOCX
          </button>

          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white text-brand-900 px-3 py-1.5 rounded font-medium text-xs hover:bg-gray-100 transition-colors"
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Sidebar */}
        <div className="w-1/3 min-w-[350px] max-w-[500px] h-full z-0 print:hidden border-r border-gray-200">
          <Editor 
            data={articleData} 
            onChange={setArticleData} 
            onImport={handleImport}
            onImproveAbstract={handleImproveAbstract}
            isProcessing={isProcessing}
          />
        </div>

        {/* Live Preview Area */}
        <div className="flex-1 bg-gray-100 relative h-full">
           {isEditMode && (
              <div className="absolute top-4 right-4 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold shadow-md z-10 border border-yellow-300 flex items-center gap-2">
                 <Edit3 size={12} /> Direct Editing Mode
              </div>
           )}
          <ArticlePreview data={articleData} isEditable={isEditMode} />
        </div>
      </div>

      {/* LoA Modal */}
      {showLoa && (
        <LetterOfAcceptance data={articleData} onClose={() => setShowLoa(false)} />
      )}
    </div>
  );
};

export default App;
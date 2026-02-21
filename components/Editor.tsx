import React, { useState, useRef, useMemo } from 'react';
import { ArticleData, Author, EditorTab, Figure } from '../types';
import { Plus, Trash2, Wand2, FileText, Settings, User, Upload, File as FileIcon, Loader2, X, Activity, CheckCircle, Image as ImageIcon, Copy, ImageIcon as LogoIcon, Grid, ArrowRight, HelpCircle, RefreshCw, ArrowLeft, Play } from 'lucide-react';
import { extractTextFromFile } from '../services/fileExtraction';

interface EditorProps {
  data: ArticleData;
  onChange: (data: ArticleData) => void;
  onImport: (text: string) => Promise<void>;
  onImproveAbstract: () => void;
  isProcessing: boolean;
}

const Editor: React.FC<EditorProps> = ({ data, onChange, onImport, onImproveAbstract, isProcessing }) => {
  const [activeTab, setActiveTab] = useState<EditorTab>(EditorTab.METADATA);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [rawWordCount, setRawWordCount] = useState<number>(0); 
  
  // NEW: State for raw text preview before sending to AI
  const [previewText, setPreviewText] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const figureInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const updateField = <K extends keyof ArticleData>(field: K, value: ArticleData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const handleAddAuthor = () => {
    const newAuthor: Author = { name: 'New Author', affiliation: 'Affiliation', isCorresponding: false };
    updateField('authors', [...data.authors, newAuthor]);
  };

  const handleRemoveAuthor = (index: number) => {
    const newAuthors = data.authors.filter((_, i) => i !== index);
    updateField('authors', newAuthors);
  };

  const updateAuthor = (index: number, field: keyof Author, value: string | boolean) => {
    const newAuthors = [...data.authors];
    newAuthors[index] = { ...newAuthors[index], [field]: value };
    updateField('authors', newAuthors);
  };

  const handleKeywordsChange = (str: string) => {
    updateField('keywords', str.split(';').map(k => k.trim()));
  };

  // Logo Handling
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const logoUrl = URL.createObjectURL(file);
      updateField('logoUrl', logoUrl);
    }
  };

  // --- SMART FIGURE HANDLING ---
  const reindexFigures = (figures: Figure[]): Figure[] => {
    return figures.map((fig, index) => {
        const newNum = index + 1;
        let newName = `Figure ${newNum}`;
        const match = fig.name.match(/^Figure \d+(.*)/);
        if (match && match[1]) {
            newName = `Figure ${newNum}${match[1]}`;
        }

        return {
            ...fig,
            id: `figure-${newNum}`, 
            name: newName
        };
    });
  };

  const handleFigureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const newFiguresRaw: Figure[] = files.map((file) => ({
        id: 'temp', 
        name: 'Figure Temp', 
        file: file,
        previewUrl: URL.createObjectURL(file)
      }));

      const combined = [...data.figures, ...newFiguresRaw];
      const reindexed = reindexFigures(combined);
      
      updateField('figures', reindexed);
      e.target.value = '';
    }
  };

  const removeFigure = (id: string) => {
    const filtered = data.figures.filter(f => f.id !== id);
    const reindexed = reindexFigures(filtered);
    updateField('figures', reindexed);
  };

  const updateFigureName = (id: string, newName: string) => {
    const figures = data.figures.map(f => f.id === id ? { ...f, name: newName } : f);
    updateField('figures', figures);
  };

  // QC Statistics Calculation
  const qcStats = useMemo(() => {
    const content = data.content || '';
    const wordCount = content.trim().length === 0 ? 0 : content.trim().split(/\s+/).length;
    
    let transferPercentage = 100;
    if (rawWordCount > 0) {
        transferPercentage = Math.round((wordCount / rawWordCount) * 100);
        if (transferPercentage > 100) transferPercentage = 100;
    }
    
    const hasIntro = /#+\s*(\d+\.?\s*)?Introduction/i.test(content);
    const hasMethods = /#+\s*(\d+\.?\s*)?(Methods|Methodology|Materials\s+and\s+Methods)/i.test(content);
    const hasResults = /#+\s*(\d+\.?\s*)?Results/i.test(content);
    const hasDiscussion = /#+\s*(\d+\.?\s*)?Discussion/i.test(content);
    const hasReferences = /#+\s*(\d+\.?\s*)?References/i.test(content);

    const refCount = (content.match(/\[\d+\]/g) || []).length + (content.match(/^\d+\.\s/gm) || []).length;
    const figureCount = (content.match(/!\[.*?\]/g) || []).length;
    const tableCount = (content.match(/\|.*\|/g) || []).length > 0 ? 'Detected' : 'None';

    return {
      wordCount,
      transferPercentage,
      sections: { hasIntro, hasMethods, hasResults, hasDiscussion, hasReferences },
      refCount,
      figureCount,
      tableCount
    };
  }, [data.content, rawWordCount]);

  // File Import Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (activeTab === EditorTab.FIGURES) {
         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
             const files = Array.from(e.dataTransfer.files) as File[];
             files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
             const newFiguresRaw: Figure[] = files.map((file) => ({
                id: 'temp', 
                name: 'Figure Temp',
                file: file,
                previewUrl: URL.createObjectURL(file)
             }));
             const combined = [...data.figures, ...newFiguresRaw];
             const reindexed = reindexFigures(combined);
             updateField('figures', reindexed);
         }
    } else {
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }
  };

  const handleChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    setUploadedFile(file);
    setExtractionLoading(true);
    try {
      const text = await extractTextFromFile(file);
      const rawWords = text.trim().split(/\s+/).length;
      setRawWordCount(rawWords); 
      
      // CHANGED: Instead of calling onImport immediately, set Preview state
      setPreviewText(text);
      setUploadedFile(null); 
      // Stay on current tab (AI_TOOLS) to show preview
    } catch (error) {
      alert("Error processing file. Please ensure it is a valid text, PDF, or DOCX file.");
      setUploadedFile(null);
    } finally {
      setExtractionLoading(false);
    }
  };

  const handleConfirmGeneration = async () => {
    if (!previewText) return;
    await onImport(previewText);
    setPreviewText(null);
    setActiveTab(EditorTab.CONTENT);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 shadow-sm">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab(EditorTab.METADATA)}
          className={`flex-1 min-w-[60px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${activeTab === EditorTab.METADATA ? 'text-brand-700 border-b-2 border-brand-700 bg-brand-50' : 'text-gray-500 hover:text-gray-700'}`}
          title="1. Metadata"
        >
          <div className="flex items-center gap-1">
             <span className="bg-gray-200 text-gray-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">1</span>
             <span>Meta</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab(EditorTab.FIGURES)}
          className={`flex-1 min-w-[60px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${activeTab === EditorTab.FIGURES ? 'text-brand-700 border-b-2 border-brand-700 bg-brand-50' : 'text-gray-500 hover:text-gray-700'}`}
          title="2. Figures"
        >
          <div className="flex items-center gap-1">
             <span className="bg-gray-200 text-gray-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">2</span>
             <span>Figs</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab(EditorTab.AI_TOOLS)}
          className={`flex-1 min-w-[60px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${activeTab === EditorTab.AI_TOOLS ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50' : 'text-gray-500 hover:text-gray-700'}`}
          title="3. Generate"
        >
          <div className="flex items-center gap-1">
             <span className="bg-purple-200 text-purple-800 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">3</span>
             <span>Generate</span>
          </div>
        </button>
         <button
          onClick={() => setActiveTab(EditorTab.CONTENT)}
          className={`flex-1 min-w-[60px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${activeTab === EditorTab.CONTENT ? 'text-brand-700 border-b-2 border-brand-700 bg-brand-50' : 'text-gray-500 hover:text-gray-700'}`}
          title="Review"
        >
          <FileText size={16} />
          <span>Body</span>
        </button>
        <button
          onClick={() => setActiveTab(EditorTab.QC)}
          className={`flex-1 min-w-[60px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${activeTab === EditorTab.QC ? 'text-green-600 border-b-2 border-green-600 bg-green-50' : 'text-gray-500 hover:text-gray-700'}`}
          title="Quality Control"
        >
          <Activity size={16} />
          <span>QC</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* METADATA TAB */}
        {activeTab === EditorTab.METADATA && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
             <div className="text-xs bg-blue-50 text-blue-800 p-2 rounded border border-blue-100 flex items-center gap-2">
                <span className="font-bold border border-blue-300 rounded-full w-5 h-5 flex items-center justify-center bg-white">1</span>
                Please complete manuscript metadata.
             </div>

            {/* Logo Upload Section */}
            <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-bold text-gray-700 uppercase">Journal Logo</h3>
                    <button 
                        onClick={() => logoInputRef.current?.click()}
                        className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200 flex items-center gap-1 border border-gray-300"
                    >
                        <LogoIcon size={12} /> Upload
                    </button>
                    <input 
                        type="file" 
                        ref={logoInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleLogoUpload}
                    />
                </div>
                {data.logoUrl ? (
                    <div className="flex items-center gap-3">
                        <img src={data.logoUrl} alt="Logo" className="h-12 w-12 object-contain bg-white border rounded" />
                        <span className="text-xs text-gray-600">Custom logo active</span>
                        <button onClick={() => updateField('logoUrl', undefined)} className="text-red-500 hover:underline text-xs">Remove</button>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500 italic">No custom logo. Default JBSH logo will be used.</p>
                )}
            </div>

            {/* Journal Dates */}
            <div className="bg-gray-50 p-4 rounded border border-gray-200">
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Journal Issue Details</h3>
              <div className="grid grid-cols-1 gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Vol</label>
                    <input value={data.volume || ''} onChange={(e) => updateField('volume', e.target.value)} className="w-full border rounded p-1.5 text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">No</label>
                    <input value={data.issue || ''} onChange={(e) => updateField('issue', e.target.value)} className="w-full border rounded p-1.5 text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Pages</label>
                    <input value={data.pages || ''} onChange={(e) => updateField('pages', e.target.value)} className="w-full border rounded p-1.5 text-xs" />
                  </div>
                </div>
                 <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">DOI</label>
                    <input value={data.doi || ''} onChange={(e) => updateField('doi', e.target.value)} className="w-full border rounded p-1.5 text-xs" placeholder="10.34310/jbsh..." />
                  </div>
                  
                   {/* NEW: Dates Section */}
                  <div className="pt-2 mt-2 border-t border-gray-200">
                     <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Article Dates</p>
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Received</label>
                            <input value={data.receivedDate || ''} onChange={(e) => updateField('receivedDate', e.target.value)} className="w-full border rounded p-1.5 text-xs" placeholder="e.g. 1 Jan 2024" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Revised</label>
                            <input value={data.revisedDate || ''} onChange={(e) => updateField('revisedDate', e.target.value)} className="w-full border rounded p-1.5 text-xs" placeholder="e.g. 15 Jan 2024" />
                        </div>
                         <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Accepted</label>
                            <input value={data.acceptedDate || ''} onChange={(e) => updateField('acceptedDate', e.target.value)} className="w-full border rounded p-1.5 text-xs" placeholder="e.g. 1 Feb 2024" />
                        </div>
                         <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Published</label>
                            <input value={data.publishedDate || ''} onChange={(e) => updateField('publishedDate', e.target.value)} className="w-full border rounded p-1.5 text-xs" placeholder="e.g. 1 Mar 2024" />
                        </div>
                     </div>
                  </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-700">Authors</label>
                <button onClick={handleAddAuthor} className="text-xs flex items-center gap-1 text-brand-600 hover:text-brand-800 font-medium">
                  <Plus size={14} /> Add Author
                </button>
              </div>
              <div className="space-y-3">
                {data.authors.map((author, idx) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-md bg-gray-50 relative group">
                    <button 
                      onClick={() => handleRemoveAuthor(idx)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                    <input
                      type="text"
                      value={author.name}
                      onChange={(e) => updateAuthor(idx, 'name', e.target.value)}
                      className="w-full bg-transparent border-b border-gray-200 mb-2 pb-1 text-sm font-medium focus:border-brand-500 outline-none"
                      placeholder="Full Name"
                    />
                    <input
                      type="text"
                      value={author.affiliation}
                      onChange={(e) => updateAuthor(idx, 'affiliation', e.target.value)}
                      className="w-full bg-transparent border-b border-gray-200 mb-2 pb-1 text-xs text-gray-600 focus:border-brand-500 outline-none"
                      placeholder="Institution/Affiliation"
                    />
                    <div className="flex items-center gap-4 mt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={author.isCorresponding || false}
                          onChange={(e) => updateAuthor(idx, 'isCorresponding', e.target.checked)}
                          className="rounded text-brand-600 focus:ring-brand-500"
                        />
                        Corresponding
                      </label>
                      {author.isCorresponding && (
                        <input
                          type="email"
                          value={author.email || ''}
                          onChange={(e) => updateAuthor(idx, 'email', e.target.value)}
                          className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:border-brand-500 outline-none"
                          placeholder="Email Address"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end pt-4">
                <button 
                  onClick={() => setActiveTab(EditorTab.FIGURES)}
                  className="bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700 flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  Next Step: Figures <ArrowRight size={14} />
                </button>
            </div>
          </div>
        )}

        {/* FIGURES TAB */}
        {activeTab === EditorTab.FIGURES && (
           <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
             <div className="text-xs bg-blue-50 text-blue-800 p-2 rounded border border-blue-100 flex items-center gap-2">
                <span className="font-bold border border-blue-300 rounded-full w-5 h-5 flex items-center justify-center bg-white">2</span>
                <span>
                  Upload figures. <strong>Tip:</strong> Select multiple files at once. They will be automatically sorted by name and numbered sequentially (Figure 1, Figure 2, etc.).
                </span>
             </div>

             <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">Manuscript Figures</h3>
                <button 
                  onClick={() => figureInputRef.current?.click()}
                  className="bg-brand-600 text-white px-3 py-2 rounded-md hover:bg-brand-700 flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  <Plus size={16} /> Batch Upload
                </button>
                <input 
                  type="file" 
                  ref={figureInputRef}
                  className="hidden"
                  accept="image/*"
                  multiple // ALLOW MULTIPLE SELECTION
                  onChange={handleFigureUpload}
                />
             </div>

             {/* Drag Drop Area */}
             <div 
                className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors ${
                  dragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
             >
                <ImageIcon className="text-gray-400 mb-2" size={32} />
                <p className="text-sm text-gray-600">Drag and drop images here (Multiple allowed)</p>
             </div>

             {/* Figure List */}
             {data.figures.length > 0 && (
                <div className="grid grid-cols-1 gap-4">
                  {data.figures.map(fig => (
                    <div key={fig.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex gap-3 items-start">
                      <div className="w-20 h-20 shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center border border-gray-100">
                         <img src={fig.previewUrl} alt={fig.name} className="w-full h-full object-cover" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                         <div className="mb-2 flex items-center gap-2">
                            <span className="bg-brand-100 text-brand-800 text-[10px] font-bold px-2 py-0.5 rounded">
                                {fig.id}
                            </span>
                         </div>
                         <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Caption / Name</label>
                             <input 
                                value={fig.name}
                                onChange={(e) => updateFigureName(fig.id, e.target.value)}
                                className="w-full text-sm border-b border-gray-200 focus:border-brand-500 outline-none pb-0.5 font-medium"
                                placeholder="e.g. Figure 1"
                             />
                         </div>
                      </div>
                      
                      <button 
                        onClick={() => removeFigure(fig.id)}
                        className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded transition-colors"
                        title="Remove Figure (Sequence will auto-adjust)"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
               <div className="flex justify-end pt-4">
                <button 
                  onClick={() => setActiveTab(EditorTab.AI_TOOLS)}
                  className="bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700 flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  Next Step: Upload & Generate <ArrowRight size={14} />
                </button>
            </div>
           </div>
        )}

        {/* GENERATE TAB (Formerly AI Tools) */}
        {activeTab === EditorTab.AI_TOOLS && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
            {/* AI Configuration Section */}
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 space-y-4">
              <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                <Settings size={16} /> AI Configuration
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-purple-700 uppercase mb-1">External Gemini API Key (Optional)</label>
                  <input 
                    type="password"
                    value={data.geminiApiKey || ''} 
                    onChange={(e) => updateField('geminiApiKey', e.target.value)} 
                    className="w-full border border-purple-200 rounded p-1.5 text-xs focus:ring-1 focus:ring-purple-500 outline-none" 
                    placeholder="Leave empty to use default key"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-purple-700 uppercase mb-1">Gemini Model</label>
                  <select 
                    value={data.geminiModel || 'gemini-3-flash-preview'} 
                    onChange={(e) => updateField('geminiModel', e.target.value)}
                    className="w-full border border-purple-200 rounded p-1.5 text-xs bg-white focus:ring-1 focus:ring-purple-500 outline-none"
                  >
                    <optgroup label="Gemini 3 (Latest)">
                      <option value="gemini-3-flash-preview">Gemini 3 Flash (Fastest)</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Most Capable)</option>
                    </optgroup>
                    <optgroup label="Gemini 2.5">
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    </optgroup>
                    <optgroup label="Gemini 1.5 (Legacy)">
                      <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option>
                      <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro</option>
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>

            {previewText ? (
                // --- REVIEW STATE ---
                <div className="flex flex-col h-full space-y-4">
                     <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <h3 className="text-yellow-800 font-bold mb-1">Raw Text Review</h3>
                        <p className="text-xs text-yellow-700">
                            <strong>Is the text mashed together?</strong> Use this editor to fix it! <br/>
                            1. Ensure the <strong>Title</strong>, <strong>Authors</strong>, and <strong>Headings</strong> are on their own lines.<br/>
                            2. Add empty lines between paragraphs.<br/>
                            3. When it looks structured, click "Generate Manuscript".
                        </p>
                    </div>
                    
                    <textarea 
                        value={previewText}
                        onChange={(e) => setPreviewText(e.target.value)}
                        className="w-full h-96 border border-gray-300 rounded-md p-3 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-brand-500 outline-none"
                    />

                    <div className="flex gap-3 justify-end">
                        <button 
                            onClick={() => setPreviewText(null)}
                            className="text-gray-600 hover:text-gray-800 px-4 py-2 text-sm font-medium flex items-center gap-2"
                        >
                            <ArrowLeft size={16} /> Cancel
                        </button>
                        <button 
                            onClick={handleConfirmGeneration}
                            disabled={isProcessing}
                            className="bg-brand-600 text-white px-6 py-2 rounded-md hover:bg-brand-700 flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                            Generate Manuscript
                        </button>
                    </div>
                </div>
            ) : (
                // --- UPLOAD STATE ---
                <>
                <div className="bg-purple-50 p-6 rounded-lg border border-purple-100 text-center">
                <div className="mb-4 flex justify-center">
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                        <Wand2 size={24} />
                    </div>
                </div>
                <h3 className="text-xl font-bold text-purple-900 mb-2">
                    Generate Manuscript Layout
                </h3>
                <p className="text-sm text-purple-800 mb-6 max-w-xs mx-auto">
                    Upload your raw DOCX, PDF, or TXT. You will have a chance to review the text before AI processing.
                </p>
                
                <div 
                    className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                    dragActive ? 'border-purple-500 bg-purple-100' : 'border-purple-300 bg-white hover:border-purple-500 hover:shadow-md'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={triggerFileInput}
                >
                    <input 
                    ref={fileInputRef}
                    type="file" 
                    className="hidden" 
                    accept=".txt,.md,.doc,.docx,.pdf"
                    onChange={handleChangeFile}
                    />
                    
                    {extractionLoading ? (
                    <div className="flex flex-col items-center">
                        <Loader2 size={48} className="text-purple-600 animate-spin mb-4" />
                        <span className="text-lg font-bold text-purple-900">Extracting Text...</span>
                    </div>
                    ) : (
                    <>
                        <Upload size={40} className="text-purple-400 mb-4" />
                        <span className="text-base font-bold text-purple-900">Click to Upload Manuscript File</span>
                        <span className="text-sm text-purple-500 mt-2">or drag and drop file here</span>
                    </>
                    )}
                </div>
                </div>
                
                <div className="text-xs text-gray-500 text-center">
                    Ensure you have completed Step 1 (Metadata) and Step 2 (Figure Uploads) before uploading the manuscript for best results.
                </div>
                </>
            )}
          </div>
        )}

        {/* CONTENT TAB (Read Only / Manual Edit) */}
        {activeTab === EditorTab.CONTENT && (
          <div className="h-full flex flex-col animate-in fade-in slide-in-from-left-4 duration-300">
            <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-700">
                Generated Markdown Body
                </label>
                 <button 
                  onClick={onImproveAbstract} 
                  disabled={isProcessing || !data.abstract}
                  className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 disabled:opacity-50"
                >
                  <Wand2 size={12} /> AI Polish Abstract
                </button>
            </div>
            
            {isProcessing ? (
                 <div className="flex-1 w-full border border-gray-300 rounded-md p-12 flex flex-col items-center justify-center bg-gray-50">
                    <Loader2 size={48} className="text-purple-600 animate-spin mb-4" />
                    <h3 className="text-lg font-bold text-purple-900">AI is Generating Manuscript...</h3>
                    <p className="text-sm text-purple-700 mt-2 max-w-xs text-center">
                        This may take 30-60 seconds. We are structuring sections, formatting tables, and linking citations.
                    </p>
                 </div>
            ) : (
                <textarea
                value={data.content}
                onChange={(e) => updateField('content', e.target.value)}
                className="flex-1 w-full border border-gray-300 rounded-md p-4 text-sm font-mono leading-relaxed focus:ring-2 focus:ring-brand-500 outline-none resize-none min-h-[500px]"
                placeholder="# Introduction\n\nWaiting for generation..."
                />
            )}
          </div>
        )}

        {/* QC TAB */}
        {activeTab === EditorTab.QC && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
             <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h3 className="text-green-900 font-bold flex items-center gap-2 mb-4">
                  <Activity size={18} /> Quality Control
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">Content Transfer Ratio</span>
                        <div className="group relative">
                             <HelpCircle size={14} className="text-gray-400 cursor-help" />
                             <div className="absolute left-0 bottom-full mb-2 w-48 bg-gray-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                A ratio of 90-95% is ideal. It indicates that page numbers, running headers, and artifacts from the raw file have been successfully cleaned, while the manuscript body remains intact.
                             </div>
                        </div>
                    </div>
                    <span className={`text-sm font-bold ${qcStats.transferPercentage < 80 ? 'text-red-600' : 'text-green-700'}`}>
                      {qcStats.transferPercentage}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <span className="text-sm text-gray-700">Word Count (Body)</span>
                    <span className="text-sm font-bold text-gray-900">{qcStats.wordCount}</span>
                  </div>
                   <div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <span className="text-sm text-gray-700">Figures Detected</span>
                    <span className="text-sm font-bold text-gray-900">{qcStats.figureCount}</span>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Required Sections</p>
                    <div className="grid grid-cols-1 gap-2">
                      <SectionCheck label="Introduction" passed={qcStats.sections.hasIntro} />
                      <SectionCheck label="Methods / Methodology" passed={qcStats.sections.hasMethods} />
                      <SectionCheck label="Results" passed={qcStats.sections.hasResults} />
                      <SectionCheck label="Discussion" passed={qcStats.sections.hasDiscussion} />
                      <SectionCheck label="References" passed={qcStats.sections.hasReferences} />
                    </div>
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SectionCheck = ({ label, passed }: { label: string, passed: boolean }) => (
  <div className="flex items-center justify-between text-sm">
    <span className={passed ? 'text-gray-700' : 'text-red-500'}>{label}</span>
    {passed ? <CheckCircle size={16} className="text-green-500" /> : <X size={16} className="text-red-400" />}
  </div>
);

export default Editor;
import React from 'react';
import { ManuscriptData, ManuscriptFigure } from '../types';
import { Lock, Unlock, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

interface LayoutPreviewProps {
  data: ManuscriptData;
  isEditable?: boolean;
  onUpdateField?: (field: any, value: any) => void;
  onUpdateSection?: (index: number, content: string) => void;
  onUpdateFigureOrder?: (index: number, direction: 'up' | 'down') => void;
  onRemoveFigure?: (id: string) => void;
}

export const LayoutPreview: React.FC<LayoutPreviewProps> = ({ 
    data, 
    isEditable = false, 
    onUpdateField, 
    onUpdateSection,
    onUpdateFigureOrder,
    onRemoveFigure
}) => {
  // Helper to format authors for citation
  const citationAuthors = data.authors.length > 2 
    ? `${data.authors[0].name.split(' ').pop()} et al.` 
    : data.authors.map(a => a.name.split(' ').pop()).join(' & ');
    
  // Standard Scopus Q1 Running Head format: "J. Biomed. Sci. Health. Year; Vol(Issue): Pages"
  const runningHeadJournal = `J. Biomed. Sci. Health. ${data.year}; ${data.volume}(${data.issue}): ${data.pages}`;

  // --- AUTHOR AFFILIATION GROUPING LOGIC ---
  const uniqueAffiliations = Array.from(new Set(data.authors.map(a => a.affiliation)));
  const getAffiliationIndex = (affiliation: string) => {
      return uniqueAffiliations.indexOf(affiliation) + 1;
  };

  // --- ABSTRACT FORMATTING ---
  const formatAbstract = (text: string) => {
      if (!text) return "";
      // Bold specific keywords: Background, Methods, Results, Conclusion, Purpose, Objective
      return text.replace(/(^|\s|\.|;)(Background|Methods?|Results?|Conclusions?|Purpose|Objectives?)([:.]?)/gim, '$1<span class="font-bold">$2$3</span>');
  };

  // --- FIGURE & EQUATION INJECTION LOGIC ---
  const placedFigureIds = new Set<string>();

  // Heuristic for Equation Detection
  const isEquation = (line: string): boolean => {
      const t = line.replace(/<[^>]*>/g, '').trim();
      if (t.length > 150) return false;
      if (t.length < 2) return false;
      // Must contain math symbols
      const hasMath = /[=≈≠≤≥±×÷]/.test(t);
      // Shouldn't contain figure labels
      const isFigure = /^(Figure|Table)/i.test(t);
      // Shouldn't end with period (sentences usually do)
      return hasMath && !isFigure && !t.endsWith('.');
  };

  const injectFigures = (content: string, figures: ManuscriptFigure[]) => {
      if (!figures) figures = [];
      
      const hasPTags = content.includes('</p>');
      
      let parts: string[] = [];
      if (!hasPTags) {
          parts = content.split(/\n\n+/).filter(p => p.trim());
      } else {
          parts = content.split(/<\/p>/i).filter(p => p.trim()).map(p => p + "</p>");
      }

      let newContent = "";
      
      parts.forEach((part) => {
          let cleanPartText = part.replace(/<[^>]+>/g, '').trim();
          if (!cleanPartText) return;

          // Detect MAIN Heading (1. Introduction, or CAPS)
          const isMainHeading = cleanPartText.length < 100 && (/^\d+\.\s+[A-Z]/.test(cleanPartText) || /^[A-Z\s\W]+$/.test(cleanPartText));
          
          // Detect SUB Heading (2.1. Analysis, 3.2.1. Method)
          const isSubHeading = cleanPartText.length < 100 && /^\d+(\.\d+)+/.test(cleanPartText);
          
          // Detect Equation (Scopus Style)
          const isEq = isEquation(cleanPartText);

          // Build HTML for text part
          if (hasPTags) {
               // Existing HTML tag preserved, but inject classes for math
               if (isEq) {
                   newContent += part.replace('<p>', '<p class="text-center italic font-serif my-4">');
               } else {
                   newContent += part;
               }
          } else {
              if (isMainHeading) {
                  newContent += `<h3 class="font-bold uppercase mt-4 mb-2 text-indent-0">${cleanPartText}</h3>`;
              } else if (isSubHeading) {
                  newContent += `<h4 class="font-bold mt-3 mb-1 text-indent-0">${cleanPartText}</h4>`;
              } else if (isEq) {
                  newContent += `<div class="text-center italic font-serif my-4">${cleanPartText}</div>`;
              } else {
                  // Standard paragraph - indent 1cm
                  newContent += `<p class="indent-1cm">${cleanPartText}</p>`;
              }
          }

          // Check for Figures
          const regex = /(?:Figure|Fig\.?)\s*(\d+)/gi;
          let match;
          while ((match = regex.exec(cleanPartText)) !== null) {
              const figId = match[1];
              if (!placedFigureIds.has(figId)) {
                  const fig = figures.find(f => f.id === figId);
                  if (fig) {
                      placedFigureIds.add(figId);
                      newContent += `
                        <div class="figure-container my-6 text-center page-break-inside-avoid">
                           <div class="bg-slate-50 inline-block p-2 border border-slate-100 rounded">
                              <img src="${fig.fileUrl}" alt="${fig.caption}" class="max-h-[400px] max-w-full w-auto mx-auto object-contain mb-2" />
                           </div>
                           <div class="mt-2 px-8">
                              <span class="text-[9pt] font-bold font-sans-journal text-[#005580]">Figure ${fig.id}: </span>
                              <span class="text-[9pt] text-slate-600 font-sans-journal leading-tight">${fig.caption}</span>
                           </div>
                        </div>
                      `;
                  }
              }
          }
      });
      
      return newContent;
  };

  const processedSections = data.sections.map(section => ({
      ...section,
      content: injectFigures(section.content, data.figures)
  }));

  const remainingFigures = data.figures.filter(f => !placedFigureIds.has(f.id));

  return (
    <div className="w-full max-w-[210mm] mx-auto bg-white shadow-2xl min-h-[297mm] text-slate-900 font-serif-journal relative flex flex-col justify-between print:shadow-none print:w-full print:max-w-none print:m-0 print:p-0">
      
      {/* --- HEADER VISUALIZATION (Page 2+) --- */}
      <div className="absolute top-0 left-0 w-full px-[20mm] py-4 border-b border-slate-300 flex justify-between items-center text-[8pt] text-slate-500 font-sans-journal italic bg-slate-50 print:hidden opacity-70 hover:opacity-100 transition-opacity">
          <span className="font-semibold text-slate-400 no-print uppercase text-[7pt] tracking-widest absolute -top-3 left-[20mm] bg-slate-100 px-2 rounded-b border border-t-0 border-slate-200">Page 2+ Header Preview</span>
          <span>{citationAuthors}</span>
          <span>{runningHeadJournal}</span>
      </div>

      {/* Content Container */}
      <div className="p-[20mm] flex-grow pt-[25mm]"> 

        {/* 1. Header Section */}
        <div className="flex justify-between items-start mb-1 font-sans-journal">
             <div className="shrink-0 pt-1">
                 {data.logoUrl ? (
                     <img src={data.logoUrl} alt="JBSH Logo" className="w-[20mm] h-[20mm] object-contain" />
                 ) : (
                     <div className="w-[20mm] h-[20mm] bg-slate-200 flex items-center justify-center text-xs text-slate-400">Logo</div>
                 )}
             </div>

             <div className="flex-1 text-right pl-4">
                 <h1 className="text-[#005580] text-[16pt] font-bold font-serif-journal tracking-tight leading-none mb-1">
                    Journal of Biomedical Sciences and Health
                 </h1>
                 <p className="text-[9pt] text-slate-600 mt-0.5">e-ISSN: 3047-7182 | p-ISSN: 3062-6854</p>
                 <p className="text-[9pt] text-slate-600">
                    Available online at <span className="text-[#005580] underline">ejournal.unkaha.ac.id/index.php/jbsh</span>
                 </p>
             </div>
        </div>

        {/* 2. Open Access Bar */}
        <div className="w-full bg-[#005580] text-white text-right px-4 py-2 text-[11pt] font-bold uppercase mb-2 mt-2 font-sans-journal tracking-widest shadow-sm">
            Open Access
        </div>

        {/* 3. Vol/DOI Info Line */}
        <div className="text-[9pt] text-slate-700 border-b-[2.5px] border-slate-700 pb-1 mb-6 font-serif-journal flex flex-wrap gap-1">
            <span className="font-bold">Vol. {data.volume}, No. {data.issue}, {data.year}</span>
            <span>DOI: <span className="text-[#005580]">{data.doi}</span></span>
            <span>Pages {data.pages}</span>
        </div>

        {/* 4. Article Type & Title */}
        <div className="text-center mb-8">
            <div className="italic font-serif-journal text-slate-600 mb-3 text-[11pt]">Original Research Article</div>
            <h2 
                className={`text-[14pt] font-bold font-serif-journal text-slate-900 leading-[1.2] mb-5 px-4 ${isEditable ? 'editable-highlight' : ''}`}
                contentEditable={isEditable}
                onBlur={(e) => onUpdateField && onUpdateField('title', e.currentTarget.innerText)}
            >
                {data.title}
            </h2>

            {/* Authors */}
            <div className="text-[12pt] font-bold text-slate-900 mb-3">
                {data.authors.map((author, index) => {
                    const affNum = getAffiliationIndex(author.affiliation);
                    return (
                        <span key={index} className="inline-block mx-1">
                            {author.name.replace(/[0-9]+$/, '')}
                            <sup className="ml-[1px] text-[9pt] font-normal align-top top-[-0.3em] relative">
                                {affNum}{author.email && ","}
                                {author.email && <span className="ml-[1px]">*</span>}
                            </sup>
                            {index < data.authors.length - 1 && ","}
                        </span>
                    );
                })}
            </div>

            {/* Affiliations */}
            <div className="text-[9pt] italic text-slate-700 leading-tight px-8 mb-3 flex flex-col items-center gap-1">
                {uniqueAffiliations.map((aff, index) => (
                    <div key={index}>
                        <sup className="mr-1 text-[8pt]">{index + 1}</sup>
                        <span>{aff}</span>
                    </div>
                ))}
            </div>

            {/* Correspondence */}
            <div className="text-[8pt] text-slate-600 font-sans-journal mt-2">
                 *Corresponding author: {data.authors.find(a => a.email)?.name || data.authors[0].name}, E-mail: {data.authors.find(a => a.email)?.email || "email@example.com"}
            </div>
        </div>

        {/* 5. Abstract */}
        <div className="mb-8 relative z-10">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 relative shadow-sm">
                <div className="absolute top-0 left-6 right-6 h-[3px] bg-[#005580] rounded-b-sm"></div>
                <h3 className="text-[#005580] font-bold uppercase text-[10pt] mb-3 font-sans-journal tracking-wider text-center">Abstract</h3>
                <div 
                    className={`text-justify text-[9.5pt] leading-relaxed text-slate-800 font-serif-journal mb-4 ${isEditable ? 'editable-highlight' : ''}`}
                    contentEditable={isEditable}
                    onBlur={(e) => onUpdateField && onUpdateField('abstract', e.currentTarget.innerText)}
                    dangerouslySetInnerHTML={{ __html: formatAbstract(data.abstract) }}
                />
                <div className="border-t border-slate-200 pt-3 mt-3">
                     <div className="text-[9.5pt] text-justify font-serif-journal leading-tight text-slate-700">
                        <span className="font-bold text-[#005580]">Keywords:</span> {data.keywords.join("; ")}
                    </div>
                </div>
            </div>
        </div>

        {/* 6. Dates */}
        <div className="text-[8.5pt] text-slate-700 border-t border-slate-200 pt-2 mb-4 font-sans-journal flex flex-wrap gap-x-4 gap-y-1 justify-center bg-white">
            <span><span className="font-bold text-[#005580]">Received:</span> {data.receivedDate}</span>
            <span className="text-slate-300">|</span>
            <span><span className="font-bold text-[#005580]">Revised:</span> 20 Feb {data.year}</span>
            <span className="text-slate-300">|</span>
            <span><span className="font-bold text-[#005580]">Accepted:</span> {data.acceptedDate}</span>
            <span className="text-slate-300">|</span>
            <span><span className="font-bold text-[#005580]">Published:</span> {data.publishedDate}</span>
        </div>

        {/* 7. Cite */}
        <div className="bg-blue-50/50 border-l-[4px] border-[#005580] p-3 mb-4 text-[8.5pt] text-slate-700 font-serif-journal text-justify">
             <span className="font-bold text-[#005580] font-sans-journal">Cite this article:</span> {citationAuthors} ({data.year}). {data.title}. <i>Journal of Biomedical Sciences and Health</i>, {data.volume}({data.issue}), {data.pages}. https://doi.org/{data.doi}
        </div>

        {/* 8. License */}
        <div className="flex items-start gap-3 p-3 border border-slate-200 rounded-md bg-white mb-8">
             <div className="text-slate-600 bg-slate-100 p-1.5 rounded-full mt-0.5 shrink-0">
                <Unlock size={16} />
             </div>
             <p className="text-[8pt] text-slate-600 font-sans-journal leading-tight text-justify">
                 <span className="font-bold text-[#005580]">Open Access.</span> This article is an open access article distributed under the terms and conditions of the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline text-[#005580] hover:text-blue-700">Creative Commons Attribution 4.0 International License (CC BY 4.0)</a>.
             </p>
        </div>

        {/* 9. Main Body */}
        <div className="columns-2 gap-6 text-justify leading-relaxed text-[10pt] font-serif-journal text-slate-900 manuscript-content">
            {/* Sections with INJECTED figures */}
            {processedSections.map((section, idx) => (
            <div key={idx} className="mb-6">
                <h3 className="text-[10pt] font-bold text-slate-900 mb-2 mt-4 first:mt-0 uppercase tracking-tight">
                    {section.heading}
                </h3>
                <div 
                    className={`whitespace-pre-wrap ${isEditable ? 'editable-highlight' : ''}`}
                    contentEditable={isEditable}
                    onBlur={(e) => onUpdateSection && onUpdateSection(idx, e.currentTarget.innerHTML)}
                    dangerouslySetInnerHTML={{ __html: section.content }}
                />
            </div>
            ))}

            {/* Fallback for Remaining Figures (not mentioned in text) */}
            {remainingFigures.length > 0 && (
                <div className="col-span-all py-6 border-y border-slate-100 my-4 bg-slate-50/50 relative">
                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase text-center w-full block">Additional Figures</p>
                    
                    {remainingFigures.map((fig, idx) => (
                        <div key={fig.id} className="mb-6 last:mb-0 p-2 bg-white text-center shadow-sm border border-slate-200 mx-auto max-w-[80%] relative group page-break-inside-avoid">
                            
                            {isEditable && (
                                <div className="absolute top-2 right-2 flex gap-1 z-20 no-print">
                                    <button onClick={() => onRemoveFigure && onRemoveFigure(fig.id)} className="p-1 bg-red-50 border border-red-200 rounded hover:bg-red-100 shadow-sm ml-1"><Trash2 size={14} className="text-red-500" /></button>
                                </div>
                            )}

                            <div className="bg-slate-100 mb-2 flex items-center justify-center overflow-hidden">
                                <img src={fig.fileUrl} alt="Manuscript Figure" className="max-h-[300px] w-auto mx-auto object-contain" />
                            </div>
                            <div className="p-2">
                                <p className="text-[9pt] font-bold font-sans-journal text-[#005580]">Figure {fig.id}</p>
                                <p className="text-[9pt] text-slate-600 font-sans-journal leading-tight">{fig.caption}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {/* References */}
            <div className="col-span-all mt-4 pt-4 border-t border-slate-300">
                <h3 className="text-[10pt] font-bold text-slate-900 mb-3 uppercase">References</h3>
                <div className="columns-2 gap-6">
                    <div className="text-[9pt] text-slate-700 font-serif-journal">
                    {data.references.map((ref, i) => (
                        <div key={i} className="apa-reference">
                            {ref}
                        </div>
                    ))}
                    </div>
                </div>
            </div>
        </div>

      </div>
      {/* Footer Visual */}
      <div className="absolute bottom-0 left-0 w-full px-[20mm] py-4 border-t border-slate-300 flex flex-col items-center text-center text-[8pt] text-slate-500 font-sans-journal bg-slate-50 print:hidden opacity-70 hover:opacity-100 transition-opacity">
          <span className="font-semibold text-slate-400 no-print uppercase text-[7pt] tracking-widest absolute -top-3 right-[20mm] bg-slate-100 px-2 rounded-t border border-b-0 border-slate-200">Page 2+ Footer Preview</span>
          <div className="w-full border-t-[1.5px] border-slate-800 mb-3"></div>
          <p className="font-bold text-slate-700 mb-1">Journal of Biomedical Sciences and Health</p>
          <p>Copyright © {data.year} The Author(s). Published by Universitas Karya Husada Semarang, Indonesia</p>
          <p className="font-bold text-slate-800 text-[9pt] mt-2">2</p>
      </div>

    </div>
  );
};
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Quote, LockOpen, Lock } from 'lucide-react';
import { ArticleData } from '../types';

interface ArticlePreviewProps {
  data: ArticleData;
  isEditable?: boolean;
}

// Helper for "Capitalize Each Word" with APA-style minor words handling
const toTitleCase = (str: string) => {
  if (!str) return '';
  const minorWords = ['of', 'and', 'as', 'in', 'the', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'a', 'an'];
  return str.split(' ').map((word, index) => {
    const lowerWord = word.toLowerCase();
    // Capitalize if it's the first word or not a minor word
    if (index === 0 || !minorWords.includes(lowerWord)) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return lowerWord;
  }).join(' ');
};

const ArticlePreview: React.FC<ArticlePreviewProps> = ({ data, isEditable = false }) => {
  // Deduplicate affiliations logic
  const { uniqueAffiliations, authorsWithIndices } = useMemo(() => {
    const uniqueAffs: string[] = [];
    const processedAuthors = data.authors.map(author => {
      let affIndex = uniqueAffs.indexOf(author.affiliation);
      if (affIndex === -1) {
        uniqueAffs.push(author.affiliation);
        affIndex = uniqueAffs.length - 1;
      }
      return {
        ...author,
        affIndex: affIndex + 1 // 1-based index
      };
    });
    return { uniqueAffiliations: uniqueAffs, authorsWithIndices: processedAuthors };
  }, [data.authors]);

  // Function to bold specific keywords in abstract
  const formatAbstract = (text: string) => {
    if (!text) return 'Abstract content will appear here...';
    // Added 'References' and others as requested
    const keywords = ['Background', 'Methods', 'Results', 'Conclusions', 'Conclusion', 'Objective', 'Aim', 'Introduction', 'References'];
    let formattedText = text;
    keywords.forEach(keyword => {
      // Regex to match keyword with optional colon or period, ensuring it's not part of another word
      const regex = new RegExp(`\\b(${keyword})([:\\.]?)`, 'gi');
      formattedText = formattedText.replace(regex, '<strong>$1$2</strong>');
    });
    return <span dangerouslySetInnerHTML={{ __html: formattedText }} />;
  };

  const getCitationString = () => {
    const year = new Date().getFullYear();
    const vol = data.volume || "3";
    const iss = data.issue || "1";
    const pgs = data.pages || "1-10";
    const titleCase = toTitleCase(data.title);
    const doiValue = (data.doi && data.doi !== "null") ? data.doi : '...';
    const doiLink = `https://doi.org/${doiValue}`;
    
    // APA Style: List all authors
    const authorNames = data.authors.map(a => a.name);
    let authorsStr = "";
    if (authorNames.length === 1) {
      authorsStr = authorNames[0];
    } else if (authorNames.length === 2) {
      authorsStr = `${authorNames[0]} & ${authorNames[1]}`;
    } else {
      authorsStr = authorNames.slice(0, -1).join(", ") + ", & " + authorNames[authorNames.length - 1];
    }

    return (
        <span>
            {authorsStr} ({year}). {titleCase}. <em>Journal of Biomedical Sciences and Health</em>, <em>{vol}</em>({iss}), {pgs}. <a href={doiLink} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline hover:text-blue-900">{doiLink}</a>
        </span>
    );
  };

  const firstAuthorSurname = data.authors[0]?.name.split(' ').pop() || "Author";
  const runningAuthor = data.authors.length > 1 ? `${firstAuthorSurname} et al.` : firstAuthorSurname;
  const journalInfoShort = `J. Biomed. Sci. Health. ${new Date().getFullYear()}; ${data.volume || '3'}(${data.issue || '1'}): ${data.pages || '1-10'}`;
  const displayTitle = toTitleCase(data.title || 'Untitled Article');
  
  const correspondingAuthor = data.authors.find(a => a.isCorresponding);

  return (
    <div className="w-full h-full overflow-auto bg-gray-200 p-4 md:p-8 flex justify-center print:p-0 print:bg-white print:overflow-visible">
      <style>
        {`
          /* Indentation Rules for Preview to match DOCX */
          .prose p {
            text-indent: 1cm; /* 1cm Indent for paragraphs */
            font-family: 'Times New Roman', serif;
          }
          /* Reset indentation for figures/images/headings */
          .prose figure, .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
            text-indent: 0;
            font-family: 'Times New Roman', serif;
          }
          
             
          /* Scopus Table Styles for Preview */
          .prose table {
            border-top: 2px solid black; /* Thick top */
            border-bottom: 1px solid black;
            border-collapse: collapse;
            font-family: 'Times New Roman', serif;
          }
          .prose thead {
            border-bottom: 1px solid black;
            border-top: none; 
          }
          .prose tr:last-child {
             border-bottom: 1px solid black;
          }
          .prose td, .prose th {
            border-left: none;
            border-right: none;
            padding: 8px;
          }
        `}
      </style>
      {/* Paper Container - Simulates A4 */}
      <div 
        className="bg-white shadow-xl article-page print:shadow-none mx-auto relative flex flex-col font-serif"
        contentEditable={isEditable}
        suppressContentEditableWarning={true}
        style={{ 
          width: '210mm', 
          minHeight: '297mm',
          padding: '10mm 15mm 20mm 15mm', 
          fontFamily: '"Times New Roman", Times, serif'
        }}
      >
        {/* === PAGE 2 HEADER PREVIEW === */}
        <div className="absolute top-0 left-0 right-0 h-12 border-b border-black flex justify-between items-end px-12 pb-2 text-[10px] text-black bg-white print:hidden select-none pointer-events-none opacity-50 hover:opacity-100 transition-opacity" title="Page 2+ Running Header Preview">
            <span className="italic">{runningAuthor}.</span>
            <span>{journalInfoShort}</span>
        </div>

        {/* === HEADER SECTION (Page 1) === */}
        <div className="mb-2 mt-4">
            <div className="flex justify-between items-start mb-2">
                {/* Logo - Fixed Size 2.2cm x 2.2cm approx 83px */}
                {data.logoUrl ? (
                    <div className="w-[83px] h-[83px] flex items-center justify-center shrink-0">
                        <img src={data.logoUrl} alt="Journal Logo" className="w-full h-full object-contain" />
                    </div>
                ) : (
                    <div className="w-[83px] h-[83px] relative flex items-center justify-center border-2 border-brand-900 rounded text-brand-900 font-bold text-xl tracking-tighter shrink-0">
                        <div className="text-center leading-none">
                            <span className="block text-xl font-black">JBSH</span>
                        </div>
                    </div>
                )}
                
                {/* Journal Info - Aligned Top */}
                <div className="text-right flex flex-col items-end">
                    {/* UPDATED: Font size to 18pt (approx 24px) */}
                    <h1 className="text-[18pt] font-bold text-brand-900 mb-0 leading-none" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                        Journal of Biomedical Sciences and Health
                    </h1>
                    <p className="text-xs text-black mt-1 font-sans">
                        e-ISSN: 3047-7182 | p-ISSN: 3062-6854
                    </p>
                    <p className="text-xs text-black font-sans">
                        Available online at <a href="https://ejournal.unkaha.ac.id/index.php/jbsh" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 decoration-blue-600 hover:text-blue-800">ejournal.unkaha.ac.id/index.php/jbsh</a>
                    </p>
                </div>
            </div>

            {/* Blue Open Access Bar */}
            <div className="w-full bg-brand-900 text-white font-bold text-right px-4 py-1 uppercase text-sm tracking-widest mb-1 flex items-center justify-end gap-2">
                <span>OPEN ACCESS</span>
                <LockOpen size={14} className="text-orange-400" strokeWidth={3} />
            </div>

            {/* Metadata Line */}
            <div className="border-b-2 border-black pb-1 mb-6 flex justify-between items-center text-xs text-black">
                <span>Vol. {data.volume || '3'}, No. {data.issue || '1'}, {new Date().getFullYear()}</span>
                <span>DOI: <a href={`https://doi.org/${(data.doi && data.doi !== "null") ? data.doi : ''}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{(data.doi && data.doi !== "null") ? data.doi : '10.34310/jbsh.vX.iX.xxxx'}</a></span>
                <span>Pages {data.pages || '1-10'}</span>
            </div>
        </div>

        {/* === TITLE & AUTHORS SECTION === */}
        <div className="text-center mb-8">
            <p className="text-sm italic text-black mb-3">
                {data.articleType || 'Original Research Article'}
            </p>
            
            {/* Title Font 16pt approx 21px */}
            <h2 className="text-[21px] font-bold text-black mb-4 leading-tight">
                {displayTitle}
            </h2>

            <div className="mb-4">
                {authorsWithIndices.map((author, idx) => (
                <span key={idx} className="text-sm font-bold text-black">
                    {author.name}
                    <sup className="ml-0.5">{author.affIndex}</sup>
                    {author.isCorresponding && <sup className="ml-0.5">*</sup>}
                    {idx < data.authors.length - 1 && ', '}
                </span>
                ))}
            </div>

            <div className="text-[10pt] text-black italic space-y-0.5 mb-2">
                {uniqueAffiliations.map((aff, idx) => (
                <div key={idx}>
                    <sup className="mr-1">{idx + 1}</sup>
                    {aff}
                </div>
                ))}
            </div>
            
            {correspondingAuthor && (
                <div className="text-[10pt] text-black border-b border-gray-300 pb-4 mb-4">
                *Correspondence: <a href={`mailto:${correspondingAuthor.email}`} className="text-blue-700 underline hover:text-blue-900">{correspondingAuthor.email}</a>
                </div>
            )}
        </div>

        {/* === ABSTRACT BOX === */}
        <div className="mx-0 mb-4 bg-slate-50 border-l-[6px] border-brand-900 pl-6 py-4 pr-4 border border-slate-200">
            <h3 className="font-bold text-sm text-brand-900 mb-2 uppercase tracking-wider text-center">
                Abstract
            </h3>
            
            <div className="text-[11pt] leading-relaxed text-black text-justify mb-3">
                {formatAbstract(data.abstract)}
            </div>
            
            <div className="text-[10pt] text-gray-700">
                <span className="font-bold text-black uppercase tracking-wide">Keywords:</span> {data.keywords.join('; ')}
            </div>
        </div>

        {/* === DATES LINE (Centered below abstract) === */}
        <div className="text-[9pt] text-center text-black mb-6 border-b border-gray-200 pb-4">
             <span className="font-bold text-brand-700">Received:</span> {data.receivedDate || '...'} | <span className="font-bold text-brand-700">Revised:</span> {data.revisedDate || '...'} | <span className="font-bold text-brand-700">Accepted:</span> {data.acceptedDate || '...'} | <span className="font-bold text-brand-700">Published:</span> {data.publishedDate || '...'}
        </div>

        {/* === CITATION BOX === */}
        <div className="mx-0 mb-4 p-3 bg-cyan-50 border-l-4 border-brand-800 text-[10pt] text-black leading-tight border border-gray-200 shadow-sm text-justify">
             <span className="font-bold text-brand-900">Cite this article:</span> {getCitationString()}
        </div>

        {/* === MAIN CONTENT === */}
        {/* CHANGED: Text size to 11pt (text-[11pt]) */}
        <div className="flex-grow text-[11pt] leading-relaxed text-black text-justify" style={{ columnCount: 2, columnGap: '0.8cm' }}>
          <div className="prose prose-sm max-w-none 
            prose-headings:font-bold 
            prose-headings:text-black 
            prose-headings:uppercase
            prose-h2:text-[12pt] prose-h2:mt-4 prose-h2:mb-2 prose-h2:leading-tight
            prose-h3:text-[12pt] prose-h3:mt-3 prose-h3:mb-1 prose-h3:italic prose-h3:normal-case
            prose-p:indent-4 prose-p:my-2 prose-p:leading-5
            prose-img:mx-auto prose-img:block prose-img:rounded-none prose-img:max-w-full prose-img:my-4
            prose-table:my-4 prose-table:w-full prose-table:text-xs">
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
              components={{
                h2: ({node, ...props}) => <h2 className="uppercase font-bold text-[12pt] mt-6 mb-2 break-after-avoid" {...props} />,
                h3: ({node, ...props}) => <h3 className="font-bold italic text-[12pt] mt-4 mb-2 break-after-avoid" {...props} />,
                p: ({node, children, ...props}) => {
                  // Check if any child is an image or a figure to avoid invalid nesting in <p>
                  const isBlock = React.Children.toArray(children).some(
                    (child) => 
                      React.isValidElement(child) && 
                      (
                        child.type === 'figure' || 
                        (child.props as any)?.node?.tagName === 'img'
                      )
                  );
                  if (isBlock) return <div {...props}>{children}</div>;
                  return <p {...props}>{children}</p>;
                },
                table: ({node, ...props}) => {
                  // Heuristic: If table has more than 4 columns, make it span both columns
                  const children = (node as any)?.children || [];
                  const thead = children.find((c: any) => c.tagName === 'thead');
                  const tbody = children.find((c: any) => c.tagName === 'tbody');
                  const firstRow = (thead?.children || tbody?.children || []).find((c: any) => c.tagName === 'tr');
                  const colCount = (firstRow?.children || []).filter((c: any) => c.tagName === 'th' || c.tagName === 'td').length || 0;
                  const isLarge = colCount > 4;
                  
                  return (
                    <div className="overflow-x-auto my-4" style={isLarge ? { columnSpan: 'all' } : {} as any}>
                      <table {...props} className={`w-full text-xs ${isLarge ? 'border-t-2 border-b-2 border-black' : ''}`} />
                    </div>
                  );
                },
                img: ({node, ...props}) => {
                   const uploadedFig = data.figures.find(f => f.id === props.src);
                   const src = uploadedFig ? uploadedFig.previewUrl : props.src;
                   // Heuristic: If alt text contains "large" or "wide", span columns
                   const isLarge = props.alt?.toLowerCase().includes('large') || props.alt?.toLowerCase().includes('wide');
                   
                   return (
                     <figure 
                        className="my-4 break-inside-avoid text-center" 
                        style={isLarge ? { columnSpan: 'all' } : {} as any}
                     >
                       <img 
                        {...props} 
                        src={src} 
                        className={`mx-auto h-auto object-contain mb-1 ${isLarge ? 'w-full' : 'max-w-[300px]'}`} 
                       />
                       {props.alt && <figcaption className="text-center text-[10px] text-black font-bold">{props.alt}</figcaption>}
                     </figure>
                  );
                }
              }}
            >
              {data.content || '## 1. INTRODUCTION\n\nStart writing or import your manuscript...'}
            </ReactMarkdown>
          </div>
        </div>

        {/* === FOOTER (First Page Standard) === */}
        <div className="mt-auto pt-8 flex flex-col items-center justify-end text-center break-inside-avoid relative">
             <div className="border-t-2 border-black w-full mb-2"></div>
             
             {/* Moved License Box to Footer */}
             <div className="w-full mb-2 p-2 bg-gray-50 border border-gray-200 text-[8pt] text-black leading-tight flex items-center gap-3 rounded-sm">
                <div className="shrink-0">
                    <img 
                      src={data.licenseLogoUrl || "https://licensebuttons.net/l/by/4.0/88x31.png"} 
                      alt="License Logo" 
                      className="h-[18px] w-[51px] object-contain"
                      referrerPolicy="no-referrer"
                    />
                </div>
                <div className="text-justify">
                    This work is licensed under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline text-blue-700 hover:text-blue-900">Creative Commons Attribution 4.0 International License (CC BY 4.0)</a>
                </div>
             </div>
             
             {/* Page Number Moved to Bottom Right */}
             <div className="w-full text-right mt-1">
                 <span className="font-bold text-xs">1</span>
             </div>
        </div>

      </div>
    </div>
  );
};

export default ArticlePreview;
import React from 'react';
import { ArticleData } from '../types';
import { Download } from 'lucide-react';

interface LoAProps {
  data: ArticleData;
  onClose: () => void;
}

const LetterOfAcceptance: React.FC<LoAProps> = ({ data, onClose }) => {
  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const correspondingAuthor = data.authors.find(a => a.isCorresponding) || data.authors[0];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl h-[85vh] flex flex-col rounded-lg shadow-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="bg-brand-900 text-white p-4 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-lg">Letter of Acceptance Generated</h2>
            <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-brand-700 hover:bg-brand-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1"
                >
                    <Download size={14} /> Print / PDF
                </button>
                <button 
                  onClick={onClose}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-sm"
                >
                    Close
                </button>
            </div>
        </div>

        {/* Letter Content */}
        <div className="flex-1 overflow-auto p-12 bg-white loa-page font-serif">
            <div className="max-w-2xl mx-auto">
                {/* Letter Header */}
                <div className="flex items-center gap-4 mb-8 border-b-2 border-brand-900 pb-4">
                     <svg width="60" height="60" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="100" height="100" rx="10" fill="#0c4a6e"/>
                        <path d="M30 75V25H45C58.8071 25 70 36.1929 70 50C70 63.8071 58.8071 75 45 75H30ZM45 35H40V65H45C53.2843 65 60 58.2843 60 50C60 41.7157 53.2843 35 45 35Z" fill="white"/>
                     </svg>
                     <div>
                         <h1 className="text-xl font-bold text-brand-900 uppercase">Journal of Biomedical Sciences and Health</h1>
                         <p className="text-sm text-gray-500">ISSN: 2024-JBSH | www.jbsh-journal.org</p>
                     </div>
                </div>

                {/* Date & Addressee */}
                <div className="mb-8 font-sans text-sm">
                    <p className="mb-4">{currentDate}</p>
                    <p className="font-bold">{correspondingAuthor?.name}</p>
                    <p>{correspondingAuthor?.affiliation}</p>
                    {correspondingAuthor?.email && <p className="text-gray-600">{correspondingAuthor.email}</p>}
                </div>

                {/* Subject */}
                <div className="mb-6 font-bold text-center underline">
                    LETTER OF ACCEPTANCE
                </div>

                {/* Body */}
                <div className="space-y-4 text-justify leading-relaxed text-sm">
                    <p>Dear {correspondingAuthor?.name},</p>

                    <p>
                        We are pleased to inform you that your manuscript titled 
                        "<strong>{data.title}</strong>" has been accepted for publication in the 
                        Journal of Biomedical Sciences and Health (JBSH).
                    </p>

                    <p>
                        After a thorough review process, the editorial board and reviewers have determined that your work 
                        meets the high standards of our journal. Your contribution is significant to the field, 
                        and we are excited to share it with our readership.
                    </p>

                    <p>
                        Your article is scheduled for publication in <strong>Volume {data.volume || 'X'}, Issue {data.issue || 'X'} ({new Date().getFullYear()})</strong>.
                        Please note that the article will be available Open Access under the Creative Commons Attribution 4.0 International License (CC BY 4.0).
                    </p>
                    
                    <p>
                        <strong>Publication Details:</strong><br/>
                        DOI: {data.doi || 'Pending Assignment'}<br/>
                        Received: {data.receivedDate || 'N/A'} | Revised: {data.revisedDate || 'N/A'} | Accepted: {data.acceptedDate || 'N/A'}
                    </p>

                    <p>
                        We look forward to receiving your future manuscripts.
                    </p>
                </div>

                {/* Sign Off */}
                <div className="mt-16">
                    <p className="mb-6">Sincerely,</p>
                    
                    <div className="mb-2">
                        <div className="w-48 h-12 border-b border-gray-400 mb-2 font-dancing text-2xl text-brand-800 italic">
                            {/* Signature Placeholder */}
                            Editor-in-Chief
                        </div>
                    </div>
                    
                    <p className="font-bold">Prof. Medical Science, PhD.</p>
                    <p className="text-sm text-gray-600">Editor-in-Chief</p>
                    <p className="text-sm text-gray-600">Journal of Biomedical Sciences and Health</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LetterOfAcceptance;
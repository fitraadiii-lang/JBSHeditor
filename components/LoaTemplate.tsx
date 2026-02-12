import React from 'react';
import { ManuscriptData } from '../types';

interface LoaTemplateProps {
    data: ManuscriptData;
    isEditable?: boolean;
    onUpdate?: (field: keyof ManuscriptData, value: string) => void;
}

export const LoaTemplate: React.FC<LoaTemplateProps> = ({ data, isEditable = false, onUpdate }) => {
    // Default logo if missing
    const logoUrl = data.logoUrl && !data.logoUrl.includes('placeholder') 
        ? data.logoUrl 
        : "https://i.ibb.co.com/84Q0yL5/jbsh-logo.jpg";

    return (
        <div 
            className="font-serif leading-relaxed text-black relative text-sm h-full flex flex-col"
            style={{ 
                width: '100%', 
                height: '100%',
                padding: '25mm',
                boxSizing: 'border-box'
            }}
        >
            {/* Header */}
            <div className="border-b-[3px] border-double border-slate-800 pb-4 mb-6 flex items-center gap-4">
                    <div className="shrink-0">
                        <img src={logoUrl} className="h-20 w-auto object-contain" alt="Logo" />
                    </div>
                    <div className="flex-1 text-left">
                        <h1 className="text-lg font-bold text-[#005580] uppercase tracking-tight leading-none">Journal of Biomedical Sciences and Health</h1>
                        <p className="text-xs text-slate-700 font-bold mt-1">Universitas Karya Husada Semarang</p>
                        <p className="text-xs text-slate-600 leading-tight">Jl. Kompol R Soekanto No. 46, Semarang, Jawa Tengah, Indonesia</p>
                        <p className="text-[10px] font-bold text-slate-800 mt-1">e-ISSN: 3047-7182 | p-ISSN: 3062-6854 | Email: jbsh@unkaha.ac.id</p>
                    </div>
            </div>

            {/* Date & Ref */}
            <div className="flex justify-between mb-6 text-xs">
                <div>
                        <p>Number: <span 
                            className={`font-bold ${isEditable ? 'hover:bg-blue-50 cursor-text rounded px-1' : ''}`}
                            contentEditable={isEditable}
                            suppressContentEditableWarning
                            onBlur={(e) => onUpdate && onUpdate('loaNumber', e.currentTarget.innerText)}
                        >{data.loaNumber}</span></p>
                        <p>Date: <span 
                            className={`${isEditable ? 'hover:bg-blue-50 cursor-text rounded px-1' : ''}`}
                            contentEditable={isEditable}
                            suppressContentEditableWarning
                            onBlur={(e) => onUpdate && onUpdate('loaDate', e.currentTarget.innerText)}
                        >{data.loaDate || data.acceptedDate}</span></p>
                </div>
            </div>

            {/* Recipient */}
            <div className="mb-6">
                <p className="font-bold text-sm">To:</p>
                <div 
                    className={`font-bold text-base leading-snug ${isEditable ? 'hover:bg-blue-50 cursor-text rounded px-1' : ''}`}
                    // Note: We don't bind this back to authors array directly because it's complex HTML. 
                    // This is a visual edit for the LoA only. Ideally we would update authors, but for LoA text tweaks, 
                    // we can't easily map back to array. 
                    // Strategy: If user edits this, we effectively detach it? 
                    // Actually, let's keep it simple: Changing authors in Metadata is best. 
                    // But if they MUST edit here, we let them, but it won't persist to metadata authors array, just visual?
                    // The prompt asked for "edit semua teksnya". 
                    // We will allow editing but note it might not save back to the structured `authors` array perfectly.
                    // However, we don't have a specific `loaAuthors` field. 
                    // Let's just render the authors. If they want to change authors, they should use Metadata.
                    // BUT, to satisfy "edit all text", let's make it editable and maybe save to a new 'loaRecipientOverride' field?
                    // For now, let's leave it as display-only derived from metadata to ensure consistency, 
                    // unless we add a specific field. 
                    // User said "edit semua". Let's assume they might fix a typo.
                    // We will NOT contentEditable this one to avoid desync, prompting them to use Metadata is safer for authors.
                    // OR, we make it editable and do nothing onBlur (visual only for print), but that resets on re-render.
                    // Let's stick to Metadata for Authors.
                >
                    {data.authors.map(a => a.name).join(', ')}
                </div>
                <p className="text-slate-600 italic text-xs mt-1">{data.authors[0].affiliation}</p>
            </div>

            {/* Title */}
            <div className="text-center mb-6">
                <h2 className="text-lg font-bold underline mb-1">LETTER OF ACCEPTANCE</h2>
            </div>

            {/* Body */}
            <div 
                className={`text-justify mb-6 space-y-3 text-sm flex-grow ${isEditable ? 'editable-highlight p-2 rounded' : ''}`}
                contentEditable={isEditable}
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: data.loaBody || '' }}
                onBlur={(e) => onUpdate && onUpdate('loaBody', e.currentTarget.innerHTML)}
            />

            {/* Signature */}
            <div className="mt-2 flex justify-end">
                <div className="text-center w-64">
                    <p className="mb-4 text-sm">Sincerely,</p>
                    {/* QR Code as Signature */}
                    <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent("https://ejournal.unkaha.ac.id/index.php/jbsh/about/editorialTeam")}`} 
                        alt="Signature QR" 
                        className="mx-auto mb-2 h-20 w-20"
                    />
                    <p className="font-bold underline text-sm whitespace-nowrap">Poppy Fransisca Amelia, S.SiT, M.Biomed.</p>
                    <p className="text-xs">Editor-in-Chief</p>
                    <p className="text-[10px] text-slate-500">Journal of Biomedical Sciences and Health</p>
                </div>
            </div>
            
            {/* Contact Person */}
            <div className="mt-4 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                <p><span className="font-bold">Contact Person:</span> Fitra Adi Prayogo, M.Si (+62 838-3853-5153)</p>
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 left-0 w-full text-center text-[9px] text-slate-400">
                Generated automatically by JBSH Editor Assistant System
            </div>
        </div>
    );
};
import fs from 'fs';

let content = fs.readFileSync('components/Editor.tsx', 'utf-8');

const qcUI = `        {/* QC TAB */}
        {activeTab === EditorTab.QC && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
             
             {/* Publish Readiness Status */}
             <div className={\`p-4 rounded-lg border \${qcStats.isReady ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}\`}>
                <h3 className={\`font-bold flex items-center gap-2 mb-2 \${qcStats.isReady ? 'text-green-900' : 'text-amber-900'}\`}>
                  {qcStats.isReady ? <CheckCircle size={18} /> : <AlertCircle size={18} />} 
                  {qcStats.isReady ? 'Status: Layak Publish' : 'Status: Belum Layak Publish'}
                </h3>
                <p className={\`text-sm \${qcStats.isReady ? 'text-green-800' : 'text-amber-800'}\`}>
                  {qcStats.isReady 
                    ? 'Manuskrip sudah lengkap dan memenuhi standar minimum. Anda bisa mengekspornya sekarang.' 
                    : 'Ada beberapa hal yang perlu dilengkapi sebelum manuskrip siap dipublish:'}
                </p>
                {!qcStats.isReady && qcStats.auditMessages.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {qcStats.auditMessages.map((msg, idx) => (
                      <li key={idx} className="text-sm text-amber-700 flex items-start gap-2">
                        <span className="mt-1 flex-shrink-0">•</span>
                        <span>{msg}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {qcStats.isReady && qcStats.auditMessages.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {qcStats.auditMessages.map((msg, idx) => (
                      <li key={idx} className="text-sm text-amber-700 flex items-start gap-2">
                        <span className="mt-1 flex-shrink-0 text-amber-500"><AlertCircle size={14} /></span>
                        <span>Warning: {msg}</span>
                      </li>
                    ))}
                  </ul>
                )}
             </div>

             <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h3 className="text-gray-900 font-bold flex items-center gap-2 mb-4">
                  <Activity size={18} className="text-brand-600" /> Detail Audit
                </h3>`;

content = content.replace(
  /\{\/\* QC TAB \*\/\}\n\s*\{activeTab === EditorTab\.QC && \(\n\s*<div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">\n\s*<div className="bg-green-50 p-4 rounded-lg border border-green-200">\n\s*<h3 className="text-green-900 font-bold flex items-center gap-2 mb-4">\n\s*<Activity size=\{18\} \/> Quality Control\n\s*<\/h3>/,
  qcUI
);

// update icons import if needed (CheckCircle, AlertCircle might not be imported)
if (!content.includes('CheckCircle')) {
    content = content.replace(/import \{ /, 'import { CheckCircle, AlertCircle, ');
}

fs.writeFileSync('components/Editor.tsx', content);
console.log("Updated QC UI in Editor.tsx");

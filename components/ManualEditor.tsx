import React, { useState } from 'react';
import { ManualData, ManualStep } from '../types';
import { PlayCircle, MoveUp, MoveDown, Trash2, Plus, Download, RefreshCcw, Globe, PlusCircle, FolderDown, ImagePlus } from 'lucide-react';
import { generateDocx } from '../services/docGenerator';
import { SUPPORTED_LANGUAGES } from '../constants';
import JSZip from 'jszip';

interface ManualEditorProps {
  data: ManualData;
  allManuals: Record<string, ManualData>;
  onUpdate: (newData: ManualData) => void;
  onSeekVideo: (seconds: number) => void;
  availableLanguages: string[];
  onSelectLanguage: (lang: string) => void;
  onAddLanguage: (lang: string) => void;
  isTranslating: boolean;
  onReplaceImage?: (stepIndex: number) => void; // New prop for image replacement
}

const ManualEditor: React.FC<ManualEditorProps> = ({ 
  data, 
  allManuals,
  onUpdate, 
  onSeekVideo, 
  availableLanguages, 
  onSelectLanguage, 
  onAddLanguage,
  isTranslating,
  onReplaceImage
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showLangSelector, setShowLangSelector] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [dragOverStepIndex, setDragOverStepIndex] = useState<number | null>(null);

  const handleStepChange = (index: number, field: keyof ManualStep, value: string | number) => {
    const newSteps = [...data.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    onUpdate({ ...data, steps: newSteps });
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === data.steps.length - 1)) return;
    const newSteps = [...data.steps];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];
    const renumberedSteps = newSteps.map((step, i) => ({ ...step, step_number: i + 1 }));
    onUpdate({ ...data, steps: renumberedSteps });
  };

  const handleDeleteStep = (e: React.MouseEvent, index: number) => {
    e.preventDefault(); 
    const newSteps = data.steps.filter((_, i) => i !== index).map((step, i) => ({ ...step, step_number: i + 1 }));
    onUpdate({ ...data, steps: newSteps });
  };

  const handleAddStep = () => {
    const newStep: ManualStep = {
      id: Math.random().toString(36).substring(2, 9), 
      step_number: data.steps.length + 1,
      timestamp: "00:00",
      timestamp_seconds: 0,
      title: "新しい手順",
      description: "説明文を入力...",
      screenshot_timestamp_seconds: 0,
    };
    onUpdate({ ...data, steps: [...data.steps, newStep] });
  };

  // Drag and Drop Handlers for Image Replacement
  const handleDragOver = (e: React.DragEvent, index: number) => {
    // CRITICAL: We must prevent default to allow a drop. 
    // Checking types strictly here can sometimes fail in specific browsers/security contexts during dragover.
    e.preventDefault(); 
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    
    // Only update state if needed to prevent excessive re-renders
    if (dragOverStepIndex !== index) {
      setDragOverStepIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverStepIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverStepIndex(null);

    // Validate data types here (on drop) where access is guaranteed
    const hasCustomType = e.dataTransfer.types.includes('application/x-vidmanual-frame');
    const hasTextType = e.dataTransfer.getData('text/plain') === 'VIDMANUAL_FRAME';

    if (hasCustomType || hasTextType) {
      if (onReplaceImage) {
        onReplaceImage(index);
      }
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const getSafeFilename = (title: string, lang: string) => {
    const safeTitle = title.replace(/[<>:"/\\|?*]+/g, '_').trim();
    return `${safeTitle || 'manual'}_${lang}.docx`;
  };

  const handleDownloadSingle = async () => {
    setIsDownloading(true);
    try {
      const blob = await generateDocx(data);
      triggerDownload(blob, getSafeFilename(data.title, data.language));
    } catch (error) {
      console.error(error);
      alert("Wordドキュメントの生成に失敗しました");
    } finally {
      setIsDownloading(false);
      setShowDownloadOptions(false);
    }
  };

  const handleDownloadAll = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      
      const promises = Object.keys(allManuals).map(async (lang) => {
        const manual = allManuals[lang];
        const blob = await generateDocx(manual);
        const filename = getSafeFilename(manual.title, lang);
        zip.file(filename, blob);
      });

      await Promise.all(promises);
      
      const content = await zip.generateAsync({ type: "blob" });
      triggerDownload(content, "manuals_all_languages.zip");

    } catch (error) {
      console.error(error);
      alert("ZIPファイルの生成に失敗しました");
    } finally {
      setIsDownloading(false);
      setShowDownloadOptions(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Language Tabs Container */}
      <div className="bg-slate-100 border-b border-slate-200 flex items-end justify-between">
        <div className="flex-1 flex items-center space-x-1 overflow-x-auto px-4 pt-2 no-scrollbar">
          {availableLanguages.map((langCode) => {
            const langName = SUPPORTED_LANGUAGES.find(l => l.code === langCode)?.name.split(' ')[0] || langCode;
            const isActive = data.language === langCode;
            return (
              <button
                key={langCode}
                onClick={() => onSelectLanguage(langCode)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center space-x-2 shrink-0 ${
                  isActive 
                    ? 'bg-white text-indigo-600 border-t border-x border-slate-200 shadow-sm relative top-[1px]' 
                    : 'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                }`}
              >
                 <span>{langName}</span>
              </button>
            );
          })}
        </div>
        
        <div className="relative p-2 border-l border-slate-200 bg-slate-100 shrink-0 z-20">
          <button
            onClick={() => setShowLangSelector(!showLangSelector)}
            disabled={isTranslating}
            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center"
            title="言語を追加"
          >
            {isTranslating ? <RefreshCcw size={20} className="animate-spin" /> : <PlusCircle size={20} />}
          </button>
          
          {showLangSelector && (
            <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
              <div className="p-2 text-xs font-semibold text-slate-400 bg-slate-50 border-b border-slate-100">翻訳先言語を追加...</div>
              <div className="max-h-60 overflow-y-auto">
                {SUPPORTED_LANGUAGES.filter(l => !availableLanguages.includes(l.code)).length === 0 && (
                  <div className="p-3 text-sm text-slate-400 italic text-center">全ての言語が追加されました</div>
                )}
                {SUPPORTED_LANGUAGES.filter(l => !availableLanguages.includes(l.code)).map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      onAddLanguage(lang.code);
                      setShowLangSelector(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 border-b border-slate-50 last:border-0"
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10 shadow-sm">
        <div className="w-full md:w-auto">
           <div className="flex items-center space-x-2">
             <Globe size={16} className="text-slate-400" />
             <span className="text-xs uppercase font-bold text-slate-500">{data.language}</span>
           </div>
           <input
             type="text"
             value={data.title}
             onChange={(e) => onUpdate({ ...data, title: e.target.value })}
             className="text-xl font-bold text-slate-900 bg-white border-b-2 border-slate-100 hover:border-slate-300 focus:border-indigo-500 focus:outline-none px-1 w-full transition-colors rounded-t"
           />
        </div>
        
        <div className="relative">
          <div className="flex items-center">
            {availableLanguages.length > 1 ? (
              <div className="flex bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
                <button
                   onClick={handleDownloadSingle}
                   disabled={isDownloading}
                   className="flex items-center space-x-2 text-white px-4 py-2 rounded-l-lg border-r border-indigo-500 disabled:opacity-50"
                >
                   {isDownloading ? <RefreshCcw className="animate-spin" size={18} /> : <Download size={18} />}
                   <span>Word(.docx)保存</span>
                </button>
                <button
                  onClick={() => setShowDownloadOptions(!showDownloadOptions)}
                  disabled={isDownloading}
                  className="px-2 py-2 text-white rounded-r-lg disabled:opacity-50"
                >
                  <FolderDown size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleDownloadSingle}
                disabled={isDownloading}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap"
              >
                {isDownloading ? <RefreshCcw className="animate-spin" size={18} /> : <Download size={18} />}
                <span>Word(.docx)保存</span>
              </button>
            )}
          </div>

          {showDownloadOptions && availableLanguages.length > 1 && (
             <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden">
                <button
                  onClick={handleDownloadSingle}
                  className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 border-b border-slate-100"
                >
                  現在の言語を保存 (.docx)
                </button>
                <button
                  onClick={handleDownloadAll}
                  className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 font-medium"
                >
                  全言語を一括保存 (ZIP)
                </button>
             </div>
          )}
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {data.steps.map((step, index) => (
          <div key={step.id || index} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row group transition-all hover:shadow-md">
            
            {/* Left: Controls & Image */}
            <div className="w-full md:w-1/3 lg:w-1/4 bg-slate-50 p-4 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold bg-slate-800 text-white px-2 py-1 rounded-md shadow-sm">
                  手順 {step.step_number}
                </span>
                <div className="flex space-x-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleMoveStep(index, 'up')} className="p-1.5 hover:bg-white bg-slate-200 rounded text-slate-600 shadow-sm" title="上へ移動"><MoveUp size={14} /></button>
                  <button onClick={() => handleMoveStep(index, 'down')} className="p-1.5 hover:bg-white bg-slate-200 rounded text-slate-600 shadow-sm" title="下へ移動"><MoveDown size={14} /></button>
                  <button onClick={(e) => handleDeleteStep(e, index)} className="p-1.5 hover:bg-red-50 bg-slate-200 text-red-500 rounded shadow-sm" title="削除"><Trash2 size={14} /></button>
                </div>
              </div>
              
              <div 
                className={`relative group/img cursor-pointer aspect-video bg-slate-800 rounded-lg overflow-hidden border transition-all shadow-inner
                  ${dragOverStepIndex === index ? 'border-4 border-indigo-500 ring-4 ring-indigo-200' : 'border-slate-300'}
                `}
                onClick={() => onSeekVideo(step.timestamp_seconds)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
              >
                {step.screenshot_data ? (
                  <img src={step.screenshot_data} alt={`Step ${step.step_number}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                    <span className="text-xs">画像なし</span>
                  </div>
                )}
                
                {/* Drag Over Overlay */}
                {dragOverStepIndex === index && (
                  <div className="absolute inset-0 bg-indigo-500/20 backdrop-blur-sm flex items-center justify-center z-20 pointer-events-none">
                    <div className="bg-white text-indigo-600 px-4 py-2 rounded-lg shadow-lg font-bold flex items-center gap-2">
                       <ImagePlus size={20} />
                       ドロップして差し替え
                    </div>
                  </div>
                )}

                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                   <PlayCircle className="text-white drop-shadow-lg" size={40} />
                </div>
                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {step.timestamp}
                </div>
              </div>
            </div>

            {/* Right: Text Content */}
            <div className="flex-1 p-4 flex flex-col space-y-3">
               <input
                 type="text"
                 value={step.title}
                 onChange={(e) => handleStepChange(index, 'title', e.target.value)}
                 className="text-lg font-bold text-slate-900 w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-3 py-2 outline-none transition-all"
                 placeholder="手順のタイトル"
               />
               <textarea
                 value={step.description}
                 onChange={(e) => handleStepChange(index, 'description', e.target.value)}
                 className="flex-1 w-full resize-none text-slate-800 leading-relaxed bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:bg-white rounded px-3 py-2 outline-none transition-all min-h-[100px]"
                 placeholder="手順の説明..."
               />
            </div>
          </div>
        ))}

        <button
          onClick={handleAddStep}
          className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-medium hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center space-x-2"
        >
          <Plus size={20} />
          <span>新しい手順を追加</span>
        </button>
      </div>
    </div>
  );
};

export default ManualEditor;
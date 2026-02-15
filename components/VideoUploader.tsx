import React, { useState, useRef } from 'react';
import { UploadCloud, FileUp, AlertCircle, Wand2, MonitorPlay, FileText, ArrowRight, Check, Video, Download } from 'lucide-react';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, SUPPORTED_LANGUAGES } from '../constants';
import { ProcessingState } from '../types';
import ProcessingStatus from './ProcessingStatus';

interface VideoUploaderProps {
  onUpload: (file: File, language: string) => void;
  isLoading: boolean;
  processingState: ProcessingState;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onUpload, isLoading, processingState }) => {
  const [selectedLanguage, setSelectedLanguage] = useState('ja'); // Default to Japanese
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    setError(null);
    if (!files || files.length === 0) return;

    const file = files[0];
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/avi'];

    if (!validTypes.includes(file.type)) {
      setError('サポートされていないファイル形式です。MP4, MOV, WebM, AVI を使用してください。');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`ファイルサイズが ${MAX_FILE_SIZE_MB}MB を超えています。`);
      return;
    }

    onUpload(file, selectedLanguage);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (isLoading) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  return (
    <div className="max-w-5xl mx-auto mt-6 md:mt-10 px-4">
      
      {/* Top Section: Hero & Upload - Centered and narrow */}
      <div className="max-w-2xl mx-auto">
        {/* App Description */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-4 border border-indigo-100">
             <MonitorPlay size={12} />
             <span>ソフトウェア操作マニュアルや手順書に素早く作成</span>
          </div>
          <h2 className="text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">動画を、<br/>すぐにマニュアル化。</h2>
          <p className="text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            画面録画を、手順書に自動変換。AIが動画を分析し、スクリーンショットを行い、マニュアルを自動作成します
          </p>
          <div className="flex justify-center items-center gap-6 mt-8 text-sm font-medium text-slate-500">
             <span className="flex items-center gap-1.5"><Wand2 size={16} className="text-indigo-500"/> テキスト自動生成</span>
             <span className="flex items-center gap-1.5"><FileUp size={16} className="text-indigo-500"/> スマートキャプチャ</span>
             <span className="flex items-center gap-1.5"><UploadCloud size={16} className="text-indigo-500"/> 多言語対応</span>
          </div>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 md:p-8 relative z-10">
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">作成する言語</label>
            <div className="relative">
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                disabled={isLoading}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all appearance-none bg-white text-slate-900"
                style={{ backgroundImage: 'none' }} 
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">マニュアルを作成する言語を選択してください。</p>
          </div>

          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isLoading ? 'border-indigo-200 bg-slate-50 cursor-default' : 
              dragActive ? 'border-indigo-500 bg-indigo-50 cursor-pointer' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 cursor-pointer'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isLoading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={isLoading}
            />
            
            {isLoading ? (
               <div className="py-4">
                 <ProcessingStatus state={processingState} minimal={true} />
               </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="bg-indigo-100 p-4 rounded-full">
                  <UploadCloud size={32} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-lg font-medium text-slate-700">
                    クリックしてアップロード、またはドラッグ＆ドロップ
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    MP4, MOV, WebM, AVI (最大 {MAX_FILE_SIZE_MB}MB)
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {!isLoading && (
            <p className="text-center text-xs text-slate-400 mt-4">
              ヒント: 音声解説付きの動画を使用すると、より正確な結果が得られます。
            </p>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-start space-x-2 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Section 1: How It Works */}
      <div className="mt-20 mb-16 max-w-4xl mx-auto">
        <h3 className="text-2xl font-bold text-center text-slate-900 mb-12">使い方は簡単</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector Line (Desktop only) */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-slate-200 -z-10"></div>

          {/* Step 1 */}
          <div className="flex flex-col items-center text-center group">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm mb-6 group-hover:border-indigo-300 transition-colors">
                <UploadCloud size={32} className="text-indigo-600" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm border-2 border-white">1</div>
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-2">アップロード</h4>
            <p className="text-slate-600 text-sm leading-relaxed px-4">
              画面録画ファイル（MP4, MOVなど）をドラッグ＆ドロップ。
            </p>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col items-center text-center group">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm mb-6 group-hover:border-indigo-300 transition-colors">
                <Wand2 size={32} className="text-indigo-600" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm border-2 border-white">2</div>
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-2">AI解析</h4>
            <p className="text-slate-600 text-sm leading-relaxed px-4">
              AIが動画を確認し、スクリーンショットを自動抽出します
            </p>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col items-center text-center group">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm mb-6 group-hover:border-indigo-300 transition-colors">
                <Download size={32} className="text-indigo-600" />
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm border-2 border-white">3</div>
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-2">編集・保存</h4>
            <p className="text-slate-600 text-sm leading-relaxed px-4">
              プレビュー画面で確認・編集し、Word形式でダウンロードできます。
            </p>
          </div>
        </div>
      </div>

      {/* Section 2: See the Difference */}
      <div className="mt-16 mb-20 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 md:p-12 text-center">
          <h3 className="text-2xl font-bold text-slate-900 mb-10">これだけの違いがあります</h3>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
            {/* Before Card */}
            <div className="flex flex-col items-center w-full max-w-sm">
              <div className="bg-slate-900 rounded-lg aspect-video w-full flex flex-col items-center justify-center text-slate-500 shadow-md mb-4 border border-slate-700">
                <Video size={48} className="mb-2 opacity-50" />
                <span className="text-xs font-mono">REC [00:05:23]</span>
              </div>
              <h4 className="font-semibold text-slate-900">元の画面録画</h4>
              <p className="text-slate-500 text-sm">編集前の動画ファイル</p>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex text-indigo-300">
              <ArrowRight size={40} />
            </div>
            <div className="md:hidden text-indigo-300 rotate-90 my-2">
              <ArrowRight size={32} />
            </div>

            {/* After Card */}
            <div className="flex flex-col items-center w-full max-w-sm">
               <div className="bg-white rounded-lg aspect-[4/3] w-full border border-slate-200 shadow-md mb-4 p-4 md:p-6 text-left relative overflow-hidden group hover:border-indigo-200 transition-colors">
                  {/* Decorative Document Elements */}
                  <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600"></div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-indigo-100 rounded flex items-center justify-center text-indigo-600">
                      <FileText size={16} />
                    </div>
                    <div className="h-2 w-24 bg-slate-200 rounded"></div>
                  </div>
                  
                  {/* Mock content lines */}
                  <div className="space-y-3">
                    <div className="flex gap-2">
                       <div className="w-4 h-4 rounded-full bg-slate-100 shrink-0"></div>
                       <div className="flex-1 space-y-1.5">
                          <div className="h-2 w-3/4 bg-slate-200 rounded"></div>
                          <div className="h-2 w-1/2 bg-slate-100 rounded"></div>
                       </div>
                    </div>
                    <div className="h-20 bg-slate-50 rounded border border-slate-100 flex items-center justify-center">
                       <div className="w-8 h-8 bg-slate-200 rounded opacity-50"></div>
                    </div>
                    <div className="flex gap-2">
                       <div className="w-4 h-4 rounded-full bg-slate-100 shrink-0"></div>
                       <div className="flex-1 space-y-1.5">
                          <div className="h-2 w-2/3 bg-slate-200 rounded"></div>
                       </div>
                    </div>
                  </div>

                  {/* Feature Badges */}
                  <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1.5">
                     <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100"><Check size={8}/> 画像付き</span>
                     <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100"><Check size={8}/> 多言語</span>
                  </div>
               </div>
               <h4 className="font-semibold text-slate-900">プロ仕様のマニュアル</h4>
               <p className="text-slate-500 text-sm">整形済み・編集可能</p>
            </div>
          </div>

          <p className="text-lg font-semibold text-slate-700 mt-12 max-w-2xl mx-auto">
            「5分の動画が、スクリーンショット付きの完全な手順書に。」
          </p>
        </div>
      </div>

    </div>
  );
};

export default VideoUploader;
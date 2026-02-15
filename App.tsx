import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import VideoUploader from './components/VideoUploader';
import ManualEditor from './components/ManualEditor';
import { VideoPlayer } from './components/VideoPlayer';
import { ManualData, ProcessingState, ProcessingStage } from './types';
import { uploadFile, generateManualFromVideo, translateManual } from './services/geminiService';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  // State for multiple manuals keyed by language code
  const [manuals, setManuals] = useState<Record<string, ManualData>>({});
  const [activeLang, setActiveLang] = useState<string>('ja');
  
  const [processingState, setProcessingState] = useState<ProcessingState>({
    stage: ProcessingStage.IDLE,
    progress: 0,
    message: '',
  });

  // Specific state for adding languages
  const [isTranslating, setIsTranslating] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Clean up object URL
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleUpload = async (uploadedFile: File, language: string) => {
    // Validate API key presence
    if (!process.env.API_KEY) {
      alert("APIキーが見つかりません。metadata.json または環境設定を確認してください。");
      return;
    }

    setFile(uploadedFile);
    const url = URL.createObjectURL(uploadedFile);
    setVideoUrl(url);
    
    // Reset state
    setManuals({});
    setActiveLang(language);

    setProcessingState({
      stage: ProcessingStage.UPLOADING,
      progress: 0,
      message: 'AI解析の準備中...',
    });

    try {
      // 1. Upload
      const fileUri = await uploadFile(uploadedFile, (progress) => {
         setProcessingState(prev => ({ ...prev, progress }));
      });

      // 2. Analyze & Generate
      setProcessingState({
        stage: ProcessingStage.ANALYZING,
        progress: 0,
        message: 'AIが動画を解析し、マニュアルを作成しています...',
      });

      const generatedData = await generateManualFromVideo(fileUri, language, uploadedFile.type);
      
      // 3. Extract Screenshots
      setProcessingState({
        stage: ProcessingStage.EXTRACTING_SCREENSHOTS,
        progress: 0,
        message: '各手順のスクリーンショットを抽出しています...',
      });
      
      const enrichedData = await processScreenshots(generatedData);
      
      // Set the first manual
      setManuals({ [language]: enrichedData });
      setActiveLang(language);

      setProcessingState({
        stage: ProcessingStage.COMPLETED,
        progress: 100,
        message: '完了しました！',
      });

    } catch (error: any) {
      console.error(error);
      setProcessingState({
        stage: ProcessingStage.ERROR,
        progress: 0,
        message: '動画の処理に失敗しました。',
        error: error.message || "不明なエラー",
      });
    }
  };

  const processScreenshots = async (data: ManualData): Promise<ManualData> => {
    if (!videoRef.current) return data;
    const video = videoRef.current;
    
    // Ensure video is loaded enough
    if (video.readyState < 2) {
       await new Promise(r => video.addEventListener('loadeddata', r, { once: true }));
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return data;

    const newSteps = [...data.steps];
    const totalSteps = newSteps.length;

    // Helper to capture frame
    const captureFrame = async (time: number): Promise<string> => {
      return new Promise((resolve, reject) => {
        const onSeeked = () => {
          try {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            video.removeEventListener('seeked', onSeeked);
            resolve(dataUrl);
          } catch(e) {
            reject(e); // Likely CORS issue for external URLs
          }
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = time;
      });
    };

    for (let i = 0; i < totalSteps; i++) {
      const step = newSteps[i];
      // Ensure time is within bounds
      const safeTime = Math.min(Math.max(0, step.screenshot_timestamp_seconds), video.duration || 9999);
      try {
        const dataUrl = await captureFrame(safeTime);
        newSteps[i] = { ...step, screenshot_data: dataUrl };
      } catch (e) {
        console.warn(`Failed to capture screenshot for step ${i+1}. Likely CORS or format issue.`);
      }
      // Update progress ui
      setProcessingState(prev => ({
        ...prev,
        progress: Math.round(((i + 1) / totalSteps) * 100)
      }));
    }

    return { ...data, steps: newSteps };
  };

  // Logic to replace image for a specific step using the current video player frame
  const handleImageReplace = async (stepIndex: number) => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    try {
       const canvas = document.createElement('canvas');
       canvas.width = video.videoWidth;
       canvas.height = video.videoHeight;
       const ctx = canvas.getContext('2d');
       if (!ctx) return;
       
       ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
       const dataUrl = canvas.toDataURL('image/png');
       
       // Update manual state
       setManuals(prev => {
           const currentManual = prev[activeLang];
           if (!currentManual) return prev;
           
           const newSteps = [...currentManual.steps];
           newSteps[stepIndex] = { 
               ...newSteps[stepIndex], 
               screenshot_data: dataUrl,
               screenshot_timestamp_seconds: video.currentTime
           };
           
           return {
               ...prev,
               [activeLang]: { ...currentManual, steps: newSteps }
           };
       });
       
    } catch (e) {
        console.error("Failed to capture manual frame:", e);
        alert("画像のキャプチャに失敗しました。");
    }
  };

  const handleAddLanguage = async (targetLang: string) => {
    const currentManual = manuals[activeLang];
    if (!currentManual) return;
    
    setIsTranslating(true);
    try {
       const translated = await translateManual(currentManual, targetLang);
       // Re-attach screenshots from the original manual (assuming steps map 1:1)
       // We rely on the index or step_number.
       const enrichedSteps = translated.steps.map((step, i) => {
          const originalStep = currentManual.steps.find(s => s.step_number === step.step_number) || currentManual.steps[i];
          return {
             ...step,
             screenshot_data: originalStep?.screenshot_data
          };
       });
       const enrichedManual = { ...translated, steps: enrichedSteps };
       
       setManuals(prev => ({ ...prev, [targetLang]: enrichedManual }));
       setActiveLang(targetLang);
    } catch (e) {
      console.error(e);
      alert("翻訳に失敗しました。");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSeekVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  // derived state
  const activeManual = manuals[activeLang];
  const hasManuals = Object.keys(manuals).length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 bg-slate-100 p-4 lg:p-8">
        {!hasManuals && (
          <div className="container mx-auto">
            <VideoUploader 
              onUpload={handleUpload} 
              isLoading={processingState.stage !== ProcessingStage.IDLE && processingState.stage !== ProcessingStage.ERROR} 
              processingState={processingState}
            />
            
            {/* Hidden video player for extraction */}
            {videoUrl && (
               <div className={processingState.stage === ProcessingStage.EXTRACTING_SCREENSHOTS ? "absolute opacity-0 pointer-events-none" : "hidden"}>
                 <VideoPlayer ref={videoRef} src={videoUrl} />
               </div>
            )}
          </div>
        )}

        {hasManuals && activeManual && videoUrl && (
          <div className="container mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-100px)]">
            <div className="flex flex-col space-y-4">
               <div className="bg-white p-2 rounded-xl shadow-md">
                 <VideoPlayer ref={videoRef} src={videoUrl} />
               </div>
               <div className="bg-white p-6 rounded-xl shadow-md flex-1 overflow-auto">
                 <h3 className="font-bold text-slate-800 mb-2">操作方法</h3>
                 <p className="text-sm text-slate-600 mb-4">
                   右側のエディタで生成されたマニュアルを確認・編集できます。手順の並べ替えや削除も可能です。
                   画像をクリックすると、動画の該当シーンを再生します。
                 </p>
                 <div className="text-xs text-slate-500">
                    <p>ヒント: タブの <strong>+</strong> ボタンを押すと、他の言語に翻訳して追加できます。</p>
                 </div>
               </div>
            </div>
            
            <div className="h-full rounded-xl overflow-hidden shadow-xl border border-slate-200 bg-white">
              <ManualEditor 
                data={activeManual} 
                allManuals={manuals}
                onUpdate={(updated) => setManuals(prev => ({ ...prev, [activeLang]: updated }))} 
                onSeekVideo={handleSeekVideo}
                availableLanguages={Object.keys(manuals)}
                onSelectLanguage={setActiveLang}
                onAddLanguage={handleAddLanguage}
                isTranslating={isTranslating}
                onReplaceImage={handleImageReplace}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
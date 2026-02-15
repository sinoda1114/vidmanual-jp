import React from 'react';
import { ProcessingState, ProcessingStage } from '../types';
import { CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

interface ProcessingStatusProps {
  state: ProcessingState;
  minimal?: boolean;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ state, minimal = false }) => {
  const steps = [
    { id: ProcessingStage.UPLOADING, label: '動画をアップロード中' },
    { id: ProcessingStage.ANALYZING, label: '内容を解析中' },
    { id: ProcessingStage.EXTRACTING_SCREENSHOTS, label: 'スクリーンショットを抽出中' },
  ];

  const getCurrentStepIndex = () => {
    if (state.stage === ProcessingStage.COMPLETED) return steps.length;
    if (state.stage === ProcessingStage.ERROR) return -1;
    return steps.findIndex(s => s.id === state.stage);
  };

  const currentStepIndex = getCurrentStepIndex();

  if (state.stage === ProcessingStage.IDLE) return null;

  const containerClasses = minimal 
    ? "w-full max-w-md mx-auto" 
    : "max-w-2xl mx-auto mt-8 p-6 bg-white rounded-xl shadow border border-slate-200";

  return (
    <div className={containerClasses}>
      <h3 className={`text-lg font-semibold text-slate-800 mb-4 flex items-center ${minimal ? "justify-center" : ""}`}>
        {state.stage === ProcessingStage.ERROR ? (
           <span className="text-red-600 flex items-center gap-2"><AlertTriangle /> エラー</span>
        ) : state.stage === ProcessingStage.COMPLETED ? (
           <span className="text-green-600 flex items-center gap-2"><CheckCircle2 /> 完了</span>
        ) : (
           <span className="text-indigo-600 flex items-center gap-2"><Loader2 className="animate-spin" /> 処理中...</span>
        )}
      </h3>

      {state.stage === ProcessingStage.ERROR && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4 text-sm">
          {state.error || "予期せぬエラーが発生しました。"}
        </div>
      )}

      <div className={`space-y-4 ${minimal ? "text-left bg-white/50 p-4 rounded-lg" : ""}`}>
        {steps.map((step, index) => {
          let statusColor = "text-slate-400";
          let icon = <div className="w-5 h-5 rounded-full border-2 border-slate-300" />;
          
          if (index < currentStepIndex || state.stage === ProcessingStage.COMPLETED) {
            statusColor = "text-green-600 font-medium";
            icon = <CheckCircle2 size={20} className="text-green-600" />;
          } else if (index === currentStepIndex && state.stage !== ProcessingStage.ERROR) {
            statusColor = "text-indigo-600 font-medium";
            icon = <Loader2 size={20} className="text-indigo-600 animate-spin" />;
          }

          return (
            <div key={step.id} className="flex items-center space-x-3">
              <div className="flex-shrink-0">{icon}</div>
              <span className={statusColor}>{step.label}</span>
              {index === currentStepIndex && state.progress > 0 && state.progress < 100 && (
                 <span className="text-xs text-slate-500">({state.progress}%)</span>
              )}
            </div>
          );
        })}
      </div>
      
      {state.message && state.stage !== ProcessingStage.ERROR && state.stage !== ProcessingStage.COMPLETED && (
        <p className="mt-4 text-sm text-slate-500 italic text-center animate-pulse">{state.message}</p>
      )}
    </div>
  );
};

export default ProcessingStatus;
import React, { forwardRef } from 'react';
import { GripHorizontal } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({ src }, ref) => {
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    // Set both custom type and standard text/plain for maximum compatibility
    e.dataTransfer.setData('application/x-vidmanual-frame', 'true');
    e.dataTransfer.setData('text/plain', 'VIDMANUAL_FRAME'); 
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="relative rounded-xl overflow-hidden shadow-lg bg-black aspect-video group">
      <video
        ref={ref}
        src={src}
        controls
        className="w-full h-full"
        crossOrigin="anonymous" 
      >
        Your browser does not support the video tag.
      </video>

      {/* Draggable Frame Handle */}
      <div 
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        title="現在のフレームをドラッグして、手順の画像を差し替えることができます"
      >
        <div 
          draggable
          onDragStart={handleDragStart}
          className="bg-black/60 hover:bg-indigo-600 text-white p-2 rounded-lg cursor-grab active:cursor-grabbing backdrop-blur-sm flex items-center gap-2 border border-white/20 shadow-lg transition-colors"
        >
          <GripHorizontal size={20} />
          <span className="text-xs font-bold pointer-events-none select-none">フレームをドラッグ</span>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
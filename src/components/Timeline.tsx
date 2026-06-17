import React, { useEffect, useRef } from "react";
import { Play, Pause, Square, SkipBack, ChevronLeft, ChevronRight, Key, Trash, RotateCcw, MonitorPlay, Film } from "lucide-react";
import { FrameKeyframe, Project } from "../types";

interface TimelineProps {
  project: Project;
  currentFrame: number;
  setCurrentFrame: (frame: number) => void;
  keyframes: FrameKeyframe[];
  onAddKeyframe: (frame: number) => void;
  onRemoveKeyframe: (frame: number) => void;
  onClearKeyframes: () => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  totalFrames: number;
  setTotalFrames: (frames: number) => void;
  autoKeyframe: boolean;
  setAutoKeyframe: (val: boolean) => void;
  onExportVideo: () => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  project,
  currentFrame,
  setCurrentFrame,
  keyframes,
  onAddKeyframe,
  onRemoveKeyframe,
  onClearKeyframes,
  isPlaying,
  setIsPlaying,
  totalFrames,
  setTotalFrames,
  autoKeyframe,
  setAutoKeyframe,
  onExportVideo,
}) => {
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Playback looping interval engine
  useEffect(() => {
    if (isPlaying) {
      const msPerFrame = 1000 / project.fps;
      playbackIntervalRef.current = setInterval(() => {
        setCurrentFrame((prevFrame) => {
          if (prevFrame >= totalFrames - 1) {
            return 0; // standard loop back
          }
          return prevFrame + 1;
        });
      }, msPerFrame);
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, project.fps, totalFrames, setCurrentFrame]);

  // Keyframes set helper mapped by index
  const keyframeFramesSet = React.useMemo(() => {
    return new Set(keyframes.map((k) => k.frame));
  }, [keyframes]);

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentFrame(parseInt(e.target.value) || 0);
  };

  const handlePrevFrame = () => {
    setCurrentFrame(Math.max(0, currentFrame - 1));
  };

  const handleNextFrame = () => {
    setCurrentFrame(Math.min(totalFrames - 1, currentFrame + 1));
  };

  const handleJumpToStart = () => {
    setCurrentFrame(0);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
      {/* 1. Timeline scrubbing track */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
          <span>Timeline View (Frames)</span>
          <span className="bg-indigo-950 text-indigo-300 font-bold px-2 py-0.5 rounded border border-indigo-900/50">
            FRAME {currentFrame} / {totalFrames - 1}
          </span>
        </div>

        {/* Visual tick marks container */}
        <div className="relative pt-3 pb-1 flex flex-col">
          {/* Timeline slider input */}
          <input
            type="range"
            min={0}
            max={totalFrames - 1}
            value={currentFrame}
            onChange={handleScrubChange}
            className="w-full h-2 rounded bg-slate-850 hover:bg-slate-800 accent-indigo-500 cursor-pointer appearance-none transition-colors"
          />

          {/* Golden diamonds under-track indicator mapping keyframes */}
          <div className="relative w-full h-5 mt-1.5 flex justify-between select-none">
            {Array.from({ length: totalFrames }).map((_, i) => {
              const hasKeyframe = keyframeFramesSet.has(i);
              const isCurrent = i === currentFrame;

              // Grid intervals marks
              const isTick = i % 5 === 0 || i === 0 || i === totalFrames - 1;

              return (
                <div
                  key={i}
                  onClick={() => setCurrentFrame(i)}
                  className={`flex flex-col items-center justify-start absolute cursor-pointer translate-x-[-50%]`}
                  style={{ left: `${(i / (totalFrames - 1)) * 100}%` }}
                >
                  {/* Subtle vertical tick lines */}
                  {isTick && (
                    <span className="text-[9px] font-mono leading-none text-slate-500 transition-colors">
                      {i}
                    </span>
                  )}

                  {/* Golden Diamond for saved frames */}
                  {hasKeyframe && (
                    <span 
                      className={`text-[12px] font-bold leading-none -mt-4 drop-shadow-[0_0_4px_#d97706] transition-transform hover:scale-135 ${
                        isCurrent ? "text-amber-400 scale-120" : "text-amber-500"
                      }`}
                      title={`Saved Keyframe at Frame ${i}`}
                    >
                      ◆
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Playback / Parameters Option Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-slate-800">
        
        {/* Left: Player Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleJumpToStart}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Rewind to frame 0"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          
          <button
            onClick={handlePrevFrame}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Previous Frame"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className={`p-2 px-4 rounded-lg flex items-center gap-1.5 text-xs font-semibold select-none transition-all shadow-md ${
              isPlaying 
                ? "bg-amber-600 hover:bg-amber-500 text-white" 
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-white" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Play Animation</span>
              </>
            )}
          </button>

          <button
            onClick={handleNextFrame}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors border border-slate-700"
            title="Next Frame"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Center: Keyframing action tools */}
        <div className="flex items-center gap-1.5 bg-slate-950/40 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onAddKeyframe(currentFrame)}
            className="p-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded flex items-center gap-1.5 transition-colors"
            title="Pin current skeletal pose"
          >
            <Key className="w-3.5 h-3.5 text-amber-100" />
            <span>Key Selected Frame</span>
          </button>

          <button
            onClick={() => onRemoveKeyframe(currentFrame)}
            className="p-1.5 text-slate-400 hover:text-red-400 text-xs font-medium rounded hover:bg-slate-800/50 transition-all"
            title="Remove keyframe at active mark"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClearKeyframes}
            className="p-1.5 text-slate-500 hover:text-red-400 text-xs font-medium rounded hover:bg-slate-800/50 transition-colors border-l border-slate-850"
            title="Flush entire animation frame poses"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Keyframing Parameters / Export Action */}
        <div className="flex items-center gap-3">
          {/* Keyframe Auto toggle checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 select-none">
            <input
              type="checkbox"
              checked={autoKeyframe}
              onChange={(e) => setAutoKeyframe(e.target.checked)}
              className="accent-indigo-500 rounded border-slate-700 h-4 w-4 bg-slate-800 focus:ring-0"
            />
            <span className="font-medium hover:text-indigo-400 transition-colors">Auto-Key pose</span>
          </label>

          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <span className="text-[11px] text-slate-400">Length</span>
            <input
              type="number"
              min={10}
              max={300}
              value={totalFrames}
              onChange={(e) => setTotalFrames(Math.max(10, Math.min(300, parseInt(e.target.value) || 24)))}
              className="w-12 text-center text-xs bg-slate-950 border border-slate-700 text-slate-100 rounded py-1 font-mono hover:border-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            onClick={onExportVideo}
            className="bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.02] shadow-[0_4px_12px_rgba(16,185,129,0.2)] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all outline-none"
            title="Generate high quality video rendering of animation"
          >
            <Film className="w-4 h-4 text-emerald-100 animate-pulse" />
            <span>Export MP4</span>
          </button>
        </div>
      </div>
    </div>
  );
};

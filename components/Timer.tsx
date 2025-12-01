
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Task, Settings } from '../types';
import { Button } from './Button';

interface TimerProps {
  activeTask: Task | undefined;
  settings: Settings;
  onTaskComplete: (taskId: string) => void;
  // New props for state lifting
  onToggleTimer: (taskId: string) => void;
  onSkipTimer: (taskId: string) => void;
  
  totalPomosCompleted: number;
  totalPomosExpected: number;
}

export const Timer: React.FC<TimerProps> = ({ 
  activeTask, 
  settings, 
  onTaskComplete, 
  onToggleTimer,
  onSkipTimer,
  totalPomosCompleted,
  totalPomosExpected
}) => {
  const [displayTime, setDisplayTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // --- Display Loop ---
  // Calculates 'visual' time remaining based on the persistent task state
  const updateDisplay = useCallback(() => {
      if (!activeTask) return;
      const { remainingSeconds, isRunning, lastStartedAt } = activeTask.timer;

      if (isRunning && lastStartedAt) {
          const now = Date.now();
          const elapsed = (now - lastStartedAt) / 1000;
          const currentRemaining = Math.max(0, remainingSeconds - elapsed);
          setDisplayTime(currentRemaining);
          rafRef.current = requestAnimationFrame(updateDisplay);
      } else {
          setDisplayTime(remainingSeconds);
      }
  }, [activeTask]);

  useEffect(() => {
    // Start the loop whenever the task or its state changes
    updateDisplay();
    return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateDisplay]);


  // Handle Fullscreen Toggle
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error("Error attempting to enable fullscreen:", err);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);


  // --- Helper Helpers ---
  const formatTimeDisplay = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const productivity = totalPomosExpected > 0 
    ? Math.round((totalPomosCompleted / totalPomosExpected) * 100) 
    : 0;

  const totalMinutesFocused = totalPomosCompleted * settings.pomodoroDuration;
  const hoursFocused = Math.floor(totalMinutesFocused / 60);
  const minutesFocused = totalMinutesFocused % 60;

  const taskColor = activeTask?.color || 'indigo';
  const mode = activeTask?.timer.mode || 'pomo';
  
  const getThemeColors = () => {
      if (mode !== 'pomo') return { text: 'text-emerald-300', bg: 'bg-emerald-500', border: 'border-emerald-500/30' };
      const map: Record<string, any> = {
          'indigo': { text: 'text-indigo-300', bg: 'bg-indigo-500', border: 'border-indigo-500/30' },
          'blue': { text: 'text-blue-300', bg: 'bg-blue-500', border: 'border-blue-500/30' },
          'pink': { text: 'text-pink-300', bg: 'bg-pink-500', border: 'border-pink-500/30' },
          'purple': { text: 'text-purple-300', bg: 'bg-purple-500', border: 'border-purple-500/30' },
          'orange': { text: 'text-orange-300', bg: 'bg-orange-500', border: 'border-orange-500/30' },
          'green': { text: 'text-green-300', bg: 'bg-green-500', border: 'border-green-500/30' },
      };
      return map[taskColor] || map['indigo'];
  };

  const theme = getThemeColors();

  // Shared Stats Section
  const StatsDisplay = () => (
      <div className="w-full mt-auto pt-6 border-t border-slate-800/50 z-10">
        <div className="flex items-end justify-between mb-3">
            <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Daily Productivity</p>
                <div className="flex items-baseline">
                    <span className="text-4xl font-bold text-white tracking-tight">{productivity}%</span>
                    <span className="ml-3 text-sm text-slate-400 font-medium">
                        {totalPomosCompleted} <span className="text-slate-600">/</span> {totalPomosExpected} pomos
                    </span>
                </div>
            </div>
            <div className="text-right hidden sm:block">
                <p className="text-xs text-slate-500 mb-1">Time Focused</p>
                <p className={`text-lg font-mono ${theme.text}`}>
                    {hoursFocused}h {minutesFocused.toString().padStart(2, '0')}m
                </p>
            </div>
        </div>
        
        <div className="relative h-4 bg-slate-950 rounded-full overflow-hidden shadow-inner border border-slate-800">
            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_25%,rgba(255,255,255,0.05)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.05)_75%,rgba(255,255,255,0.05)_100%)] bg-[length:20px_20px]"></div>
            <div 
                className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(255,255,255,0.3)] ${theme.bg}`}
                style={{ width: `${productivity}%` }}
            >
                <div className="absolute inset-0 bg-white/10 animate-[pulse_3s_infinite]"></div>
            </div>
        </div>
      </div>
  );

  if (!activeTask) {
    return (
      <div className="flex flex-col items-center justify-between bg-slate-900 rounded-2xl p-8 shadow-xl border border-slate-800 w-full h-full min-h-[500px]">
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 w-full">
            <div className="p-6 rounded-full bg-slate-800/50 mb-6 border-2 border-dashed border-slate-700">
                <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <p className="text-xl font-medium text-slate-300 mb-2">Ready to Focus?</p>
            <p className="text-sm">Select a task from the list to start the timer.</p>
        </div>
        {totalPomosExpected > 0 && <StatsDisplay />}
      </div>
    );
  }

  // Calculate progress for bar
  const durationTotal = mode === 'pomo' 
      ? settings.pomodoroDuration * 60
      : (mode === 'short' ? settings.shortBreakDuration * 60 : settings.longBreakDuration * 60);
  
  const progress = Math.min(100, Math.max(0, ((durationTotal - displayTime) / durationTotal) * 100));

  return (
    <div 
        ref={containerRef}
        className={`flex flex-col items-center justify-between bg-slate-900 p-8 shadow-xl border border-slate-800 relative overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-2xl w-full h-full min-h-[500px]'}`}
    >
        {/* Progress Background */}
        <div 
            className={`absolute bottom-0 left-0 h-1 transition-all duration-200 ease-linear z-20 ${theme.bg}`}
            style={{ width: `${progress}%` }}
        />

      {/* Top Controls */}
      <div className="absolute top-4 right-4 z-30">
        <button onClick={toggleFullscreen} className="text-slate-500 hover:text-white transition-colors p-2">
            {isFullscreen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> 
            ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            )}
        </button>
      </div>

      <div className="text-center space-y-2 mb-4 z-10 w-full pt-4">
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase transition-colors bg-opacity-20 ${theme.text} bg-slate-700`}>
          {mode === 'pomo' ? 'Focus Time' : mode === 'short' ? 'Short Break' : 'Long Break'}
        </span>
        <h2 className={`text-3xl font-bold text-white truncate max-w-2xl mx-auto leading-tight py-2`}>
            {activeTask.title}
        </h2>
        <div className="flex items-center justify-center space-x-2 text-slate-400 text-sm">
            <span className="bg-slate-800 px-2 py-0.5 rounded text-xs font-mono">{activeTask.completedPomodoros}/{activeTask.expectedPomodoros}</span>
            <span>Pomodoros Completed</span>
        </div>
      </div>

      <div className={`text-[120px] leading-none font-mono font-bold tracking-tighter my-8 z-10 tabular-nums drop-shadow-2xl text-slate-100`}>
        {formatTimeDisplay(displayTime)}
      </div>

      <div className="flex items-center space-x-4 z-10 mb-8">
        <Button 
            variant={activeTask.timer.isRunning ? 'secondary' : 'primary'} 
            size="lg" 
            onClick={() => onToggleTimer(activeTask.id)}
            className={`min-w-[140px] h-14 text-lg shadow-lg ${!activeTask.timer.isRunning ? theme.bg : ''}`}
        >
          {activeTask.timer.isRunning ? 'Pause' : 'Start'}
        </Button>
        
        <Button 
            variant="ghost" 
            onClick={() => onSkipTimer(activeTask.id)} 
            title="Skip current timer" 
            className="h-14 w-14 rounded-full border border-slate-700 hover:border-slate-500"
        >
           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
           </svg>
        </Button>

        <div className="w-px h-10 bg-slate-700 mx-4"></div>

        <Button 
            variant="success" 
            size="lg" 
            onClick={() => onTaskComplete(activeTask.id)} 
            className="h-14 shadow-lg shadow-emerald-500/10"
        >
           Complete Task
        </Button>
      </div>

      <StatsDisplay />
    </div>
  );
};

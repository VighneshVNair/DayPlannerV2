
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Task, TimerState, Settings } from '../types';
import { Button } from './Button';

interface TimerProps {
  activeTask: Task | undefined;
  settings: Settings;
  onTaskComplete: (taskId: string) => void;
  onPomodoroComplete: (taskId: string) => void;
  totalPomosCompleted: number;
  totalPomosExpected: number;
}

export const Timer: React.FC<TimerProps> = ({ 
  activeTask, 
  settings, 
  onTaskComplete, 
  onPomodoroComplete,
  totalPomosCompleted,
  totalPomosExpected
}) => {
  const [timeLeft, setTimeLeft] = useState(settings.pomodoroDuration * 60);
  const [timerState, setTimerState] = useState<TimerState>(TimerState.IDLE);
  const [mode, setMode] = useState<'pomo' | 'short' | 'long'>('pomo');

  // Refs to hold latest state for interval
  const stateRef = useRef({
      timeLeft,
      timerState,
      mode,
      activeTask,
      settings
  });

  useEffect(() => {
      stateRef.current = { timeLeft, timerState, mode, activeTask, settings };
  }, [timeLeft, timerState, mode, activeTask, settings]);

  // Reset timer when active task ID changes
  useEffect(() => {
    if (activeTask) {
      setTimerState(TimerState.IDLE);
      setMode('pomo');
      setTimeLeft(settings.pomodoroDuration * 60);
    }
  }, [activeTask?.id, settings.pomodoroDuration]);

  const handleTimerFinish = useCallback(() => {
    const currentMode = stateRef.current.mode;
    const currentTask = stateRef.current.activeTask;
    const currentSettings = stateRef.current.settings;

    setTimerState(TimerState.IDLE);
    const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    audio.play().catch(() => {});

    if (currentMode === 'pomo') {
      if (currentTask) onPomodoroComplete(currentTask.id);
      
      const completed = (currentTask?.completedPomodoros || 0) + 1;
      const nextMode = completed % 4 === 0 ? 'long' : 'short';
      setMode(nextMode);
      setTimeLeft((nextMode === 'long' ? currentSettings.longBreakDuration : currentSettings.shortBreakDuration) * 60);
      
      if (currentSettings.autoStartBreaks) {
        setTimerState(TimerState.RUNNING);
      }
    } else {
      setMode('pomo');
      setTimeLeft(currentSettings.pomodoroDuration * 60);
      if (currentSettings.autoStartPomodoros) {
          setTimerState(TimerState.RUNNING);
      }
    }
  }, [onPomodoroComplete]);

  useEffect(() => {
    const interval = window.setInterval(() => {
        const { timerState, timeLeft } = stateRef.current;
        if (timerState === TimerState.RUNNING) {
            if (timeLeft <= 1) {
                handleTimerFinish();
            } else {
                setTimeLeft(prev => prev - 1);
            }
        }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [handleTimerFinish]);

  const toggleTimer = () => {
    setTimerState(prev => prev === TimerState.RUNNING ? TimerState.PAUSED : TimerState.RUNNING);
  };

  const skipTimer = () => {
    handleTimerFinish();
  };

  const formatTimeDisplay = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const productivity = totalPomosExpected > 0 
    ? Math.round((totalPomosCompleted / totalPomosExpected) * 100) 
    : 0;

  const totalMinutesFocused = totalPomosCompleted * settings.pomodoroDuration;
  const hoursFocused = Math.floor(totalMinutesFocused / 60);
  const minutesFocused = totalMinutesFocused % 60;

  // Shared Stats Section
  const StatsDisplay = () => (
      <div className="w-full mt-12 pt-6 border-t border-slate-800/50 z-10">
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
                <p className="text-lg font-mono text-indigo-300">
                    {hoursFocused}h {minutesFocused.toString().padStart(2, '0')}m
                </p>
            </div>
        </div>
        
        <div className="relative h-4 bg-slate-950 rounded-full overflow-hidden shadow-inner border border-slate-800">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_25%,rgba(255,255,255,0.05)_50%,transparent_50%,transparent_75%,rgba(255,255,255,0.05)_75%,rgba(255,255,255,0.05)_100%)] bg-[length:20px_20px]"></div>
            
            <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                style={{ width: `${productivity}%` }}
            >
                <div className="absolute inset-0 bg-white/10 animate-[pulse_3s_infinite]"></div>
            </div>
        </div>
        
        <div className="mt-2 flex justify-between text-xs text-slate-500 font-medium">
             <span>Start</span>
             <span>Goal</span>
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

  const durationCurrent = mode === 'pomo' 
      ? settings.pomodoroDuration 
      : (mode === 'short' ? settings.shortBreakDuration : settings.longBreakDuration);
  
  const progress = ((durationCurrent * 60 - timeLeft) / (durationCurrent * 60)) * 100;

  return (
    <div className="flex flex-col items-center justify-between bg-slate-900 rounded-2xl p-8 shadow-xl border border-slate-800 relative overflow-hidden w-full h-full min-h-[500px]">
        {/* Progress Background */}
        <div 
            className="absolute bottom-0 left-0 h-1 bg-indigo-500 transition-all duration-1000 ease-linear z-20"
            style={{ width: `${progress}%` }}
        />

      <div className="text-center space-y-2 mb-4 z-10 w-full pt-4">
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase transition-colors ${mode === 'pomo' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
          {mode === 'pomo' ? 'Focus Time' : mode === 'short' ? 'Short Break' : 'Long Break'}
        </span>
        <h2 className="text-3xl font-bold text-white truncate max-w-2xl mx-auto leading-tight py-2">{activeTask.title}</h2>
        <div className="flex items-center justify-center space-x-2 text-slate-400 text-sm">
            <span className="bg-slate-800 px-2 py-0.5 rounded text-xs font-mono">{activeTask.completedPomodoros}/{activeTask.expectedPomodoros}</span>
            <span>Pomodoros Completed</span>
        </div>
      </div>

      <div className="text-[120px] leading-none font-mono font-bold text-slate-100 tracking-tighter my-8 z-10 tabular-nums drop-shadow-2xl">
        {formatTimeDisplay(timeLeft)}
      </div>

      <div className="flex items-center space-x-4 z-10 mb-8">
        <Button 
            variant={timerState === TimerState.RUNNING ? 'secondary' : 'primary'} 
            size="lg" 
            onClick={toggleTimer}
            className="min-w-[140px] h-14 text-lg shadow-lg shadow-indigo-500/10"
        >
          {timerState === TimerState.RUNNING ? 'Pause' : 'Start'}
        </Button>
        
        <Button variant="ghost" onClick={skipTimer} title="Skip current timer" className="h-14 w-14 rounded-full border border-slate-700 hover:border-slate-500">
           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
           </svg>
        </Button>

        <div className="w-px h-10 bg-slate-700 mx-4"></div>

        <Button variant="success" size="lg" onClick={() => onTaskComplete(activeTask.id)} className="h-14 shadow-lg shadow-emerald-500/10">
           Complete Task
        </Button>
      </div>

      {/* Footer Stats */}
      <StatsDisplay />
    </div>
  );
};

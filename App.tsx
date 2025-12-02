import React, { useState, useEffect } from 'react';
import { Settings, Task, TimerData } from './types';
import { recalculateSchedule, generateId, formatTime } from './services/scheduler';
import { parseNaturalLanguagePlan } from './services/gemini';
import { Timer } from './components/Timer';
import { TaskList } from './components/TaskList';

const DEFAULT_SETTINGS: Settings = {
  pomodoroDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoStartBreaks: false,
  autoStartPomodoros: false,
};

const DEFAULT_TIMER_STATE: TimerData = {
    remainingSeconds: 25 * 60,
    isRunning: false,
    mode: 'pomo'
};

const COLORS = ['indigo', 'blue', 'green', 'purple', 'pink', 'orange'];

// --- Smart Input Parser ---
const parseSmartInput = (input: string, startTime: number): { title: string, duration?: number, anchoredStartTime?: string } => {
    let title = input;
    let duration: number | undefined;
    let anchoredStartTime: string | undefined;

    // 1. Check for "at [time]"
    const atRegex = /\b(?:at|@)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
    const atMatch = title.match(atRegex);
    if (atMatch) {
        let h = parseInt(atMatch[1]);
        const m = parseInt(atMatch[2] || '0');
        const amp = atMatch[3]?.toLowerCase();

        if (amp === 'pm' && h < 12) h += 12;
        if (amp === 'am' && h === 12) h = 0;
        
        if (!amp && h > 0 && h <= 6) {
             h += 12;
        }

        anchoredStartTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        title = title.replace(atMatch[0], '').trim();
    }

    // 2. Check for "until lunch"
    if (title.toLowerCase().includes('until lunch')) {
        let refStartMs = startTime;
        if (anchoredStartTime) {
             const [ah, am] = anchoredStartTime.split(':').map(Number);
             const d = new Date(startTime);
             d.setHours(ah, am, 0, 0);
             refStartMs = d.getTime();
        }

        const target = new Date(refStartMs);
        target.setHours(12, 0, 0, 0); 
        let diff = (target.getTime() - refStartMs) / 60000;
        if (diff > 0) {
            duration = Math.ceil(diff);
            title = title.replace(/until lunch/i, '').trim();
        }
    }

    // 3. Check for "for half an hour"
    const halfHourRegex = /for\s+half\s+(?:an\s+)?hour/i;
    if (halfHourRegex.test(title)) {
        duration = 30;
        title = title.replace(halfHourRegex, '').trim();
    }

    // 4. Check for "for an hour"
    const anHourRegex = /for\s+(?:an?|one)\s+hour/i;
    if (anHourRegex.test(title)) {
        duration = 60;
        title = title.replace(anHourRegex, '').trim();
    }

    // 5. Check for "until [time]"
    const untilRegex = /until\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const untilMatch = title.match(untilRegex);
    if (untilMatch) {
        let h = parseInt(untilMatch[1]);
        const m = parseInt(untilMatch[2] || '0');
        const amp = untilMatch[3]?.toLowerCase();

        if (amp === 'pm' && h < 12) h += 12;
        if (amp === 'am' && h === 12) h = 0;

        let refStartMs = startTime;
        if (anchoredStartTime) {
             const [ah, am] = anchoredStartTime.split(':').map(Number);
             const d = new Date(startTime);
             d.setHours(ah, am, 0, 0);
             refStartMs = d.getTime();
        }

        const refDate = new Date(refStartMs);
        if (!amp && h < 12 && h < refDate.getHours()) h += 12;

        const target = new Date(refStartMs);
        target.setHours(h, m, 0, 0);
        
        if (target.getTime() <= refStartMs) {
             if (!amp && h < 12) {
                 target.setHours(target.getHours() + 12);
             }
             if (target.getTime() <= refStartMs) {
                 target.setDate(target.getDate() + 1);
             }
        }

        let diff = (target.getTime() - refStartMs) / 60000;
        if (diff <= 0) diff = 15; 

        duration = Math.ceil(diff);
        title = title.replace(untilMatch[0], '').trim();
    }
    
    // 6. Check for "for X min/h"
    const durationRegex = /for\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)/i;
    const durMatch = title.match(durationRegex);
    if (durMatch) {
        const val = parseFloat(durMatch[1]);
        const unit = durMatch[2].toLowerCase();
        const d = unit.startsWith('h') ? Math.ceil(val * 60) : Math.ceil(val);
        duration = d;
        title = title.replace(durMatch[0], '').trim();
    }

    return { 
        title: title.trim() || "Task", 
        duration, 
        anchoredStartTime 
    };
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskStore, setTaskStore] = useState<Record<string, Task[]>>({}); 
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  
  const [queueStartTime, setQueueStartTime] = useState<number | undefined>(undefined);
  const [manualStartTime, setManualStartTime] = useState<string>(""); 

  const [newTaskInput, setNewTaskInput] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(DEFAULT_SETTINGS.pomodoroDuration + DEFAULT_SETTINGS.shortBreakDuration);
  const [selectedColor, setSelectedColor] = useState<string>('indigo');
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [copyFeedback, setCopyFeedback] = useState(false);

  // --- Date Handling ---
  const getDateKey = (date: Date) => date.toISOString().split('T')[0];
  const currentDateKey = getDateKey(selectedDate);
  const isToday = currentDateKey === getDateKey(new Date());

  useEffect(() => {
    const loaded = taskStore[currentDateKey] || [];
    setTasks(loaded);
    if (!isToday) setActiveTaskId(undefined);
  }, [currentDateKey]);

  useEffect(() => {
     setTaskStore(prev => ({ ...prev, [currentDateKey]: tasks }));
  }, [tasks, currentDateKey]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tasks.length > 0) {
        updateSchedule(tasks, undefined, undefined, getEffectiveQueueStart());
    }
  }, [currentTime, activeTaskId, manualStartTime]); 

  // Update default task duration when settings change
  useEffect(() => {
      // Logic: Default duration = 1 cycle (Pomo + Break)
      const cycleTime = settings.pomodoroDuration + settings.shortBreakDuration;
      setNewTaskDuration(cycleTime);
  }, [settings.pomodoroDuration, settings.shortBreakDuration]);

  // --- Background Timer Logic ---
  useEffect(() => {
      const interval = setInterval(() => {
          const now = Date.now();
          let taskCompletedId: string | null = null;
          
          tasks.forEach(t => {
              if (t.timer.isRunning && t.timer.lastStartedAt) {
                  const elapsed = (now - t.timer.lastStartedAt) / 1000;
                  if (t.timer.remainingSeconds - elapsed <= 0) {
                      taskCompletedId = t.id;
                  }
              }
          });

          if (taskCompletedId) {
              handleTimerFinish(taskCompletedId!);
          }
      }, 1000); 
      return () => clearInterval(interval);
  }, [tasks]);

  const activeTask = tasks.find(t => t.id === activeTaskId);
  const totalPomosExpected = tasks.reduce((acc, t) => acc + t.expectedPomodoros, 0);
  const totalPomosCompleted = tasks.reduce((acc, t) => acc + t.completedPomodoros, 0);

  // --- Helpers ---

  const calculateExpectedPomos = (minutes: number) => {
      const cycleTime = settings.pomodoroDuration + settings.shortBreakDuration;
      // Conservative calculation: How many full/partial cycles fit?
      return Math.ceil(minutes / cycleTime);
  };

  const getEffectiveQueueStart = (): number | undefined => {
      if (manualStartTime) {
          const [h, m] = manualStartTime.split(':').map(Number);
          const d = new Date(selectedDate);
          d.setHours(h, m, 0, 0);
          return d.getTime();
      }
      return queueStartTime;
  };
  
  const updateSchedule = (
      currentTasks: Task[], 
      completedId?: string, 
      actualEnd?: number, 
      planStart?: number
  ) => {
      const schedule = recalculateSchedule(
          currentTasks, 
          completedId, 
          actualEnd, 
          activeTaskId, 
          Date.now(),
          planStart,
          selectedDate
      );
      setTasks(schedule);
  };

  const handleDateChange = (offset: number) => {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + offset);
      setSelectedDate(newDate);
  };

  const handleUpdateSettings = (newSettings: Settings) => {
      setSettings(newSettings);
  };

  // --- Timer Handlers ---

  const handleTimerFinish = (taskId: string) => {
      const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
      audio.play().catch(() => {});

      setTasks(prev => prev.map(t => {
          if (t.id !== taskId) return t;

          let nextMode: TimerData['mode'] = 'pomo';
          let nextTime = settings.pomodoroDuration * 60;
          let completedPomos = t.completedPomodoros;

          if (t.timer.mode === 'pomo') {
              completedPomos += 1;
              nextMode = completedPomos % 4 === 0 ? 'long' : 'short';
              nextTime = (nextMode === 'long' ? settings.longBreakDuration : settings.shortBreakDuration) * 60;
          } else {
              nextMode = 'pomo';
              nextTime = settings.pomodoroDuration * 60;
          }

          const shouldAutoStart = t.timer.mode === 'pomo' ? settings.autoStartBreaks : settings.autoStartPomodoros;

          return {
              ...t,
              completedPomodoros: completedPomos,
              timer: {
                  remainingSeconds: nextTime,
                  isRunning: shouldAutoStart,
                  mode: nextMode,
                  lastStartedAt: shouldAutoStart ? Date.now() : undefined
              }
          };
      }));
  };

  const handleToggleTimer = (taskId: string) => {
      setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
              if (t.timer.isRunning) {
                  const elapsed = (Date.now() - (t.timer.lastStartedAt || Date.now())) / 1000;
                  return {
                      ...t,
                      timer: {
                          ...t.timer,
                          isRunning: false,
                          remainingSeconds: Math.max(0, t.timer.remainingSeconds - elapsed),
                          lastStartedAt: undefined
                      }
                  };
              } else {
                  return {
                      ...t,
                      timer: {
                          ...t.timer,
                          isRunning: true,
                          lastStartedAt: Date.now()
                      }
                  };
              }
          } else {
              if (t.timer.isRunning) {
                  const elapsed = (Date.now() - (t.timer.lastStartedAt || Date.now())) / 1000;
                  return {
                      ...t,
                      timer: {
                          ...t.timer,
                          isRunning: false,
                          remainingSeconds: Math.max(0, t.timer.remainingSeconds - elapsed),
                          lastStartedAt: undefined
                      }
                  };
              }
              return t;
          }
      }));
  };

  const handleSkipTimer = (taskId: string) => {
      handleTimerFinish(taskId);
  };


  // --- Task Handlers ---

  const handleReorderTasks = (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const newTasks = [...tasks];
      const [movedTask] = newTasks.splice(fromIndex, 1);
      newTasks.splice(toIndex, 0, movedTask);
      updateSchedule(newTasks, undefined, undefined, getEffectiveQueueStart());
  };

  const handleTaskComplete = (taskId: string) => {
    const now = Date.now();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const isAlreadyCompleted = task.status === 'completed';
    const newStatus: Task['status'] = isAlreadyCompleted ? 'pending' : 'completed';
    let newDuration = task.duration;
    
    if (!isAlreadyCompleted) {
         if (task.startTime <= now && isToday) {
             const elapsedMinutes = Math.ceil((now - task.startTime) / 60000);
             newDuration = Math.max(1, elapsedMinutes);
         } else if (isToday) {
             newDuration = 0;
         }
    }

    if (!isAlreadyCompleted && taskId === activeTaskId) setActiveTaskId(undefined);

    const updatedTasks = tasks.map(t => 
      t.id === taskId ? { 
          ...t, 
          status: newStatus, 
          duration: newDuration,
          timer: { ...t.timer, isRunning: false } 
      } : t
    );
    
    updateSchedule(updatedTasks, !isAlreadyCompleted ? taskId : undefined, !isAlreadyCompleted ? now : undefined, getEffectiveQueueStart());
  };

  const handleSelectTask = (id: string) => {
    setActiveTaskId(id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'active' as const } : t));
  };

  const handleDeleteTask = (id: string) => {
      const remaining = tasks.filter(t => t.id !== id);
      if (remaining.length === 0) {
          setQueueStartTime(undefined);
          setTasks([]);
      } else {
          updateSchedule(remaining, undefined, undefined, getEffectiveQueueStart());
      }
  };
  
  const handleDeleteAllTasks = () => {
    if (window.confirm("Are you sure you want to delete all tasks for this day?")) {
        setQueueStartTime(undefined);
        setTasks([]);
        setActiveTaskId(undefined);
    }
  };

  const handleUpdateTask = (id: string, updates: Partial<Task>) => {
      const updatedTasks = tasks.map(t => {
          if (t.id !== id) return t;
          const newTask = { ...t, ...updates };
          if (updates.duration) {
              newTask.expectedPomodoros = calculateExpectedPomos(updates.duration);
          }
          return newTask;
      });
      updateSchedule(updatedTasks, undefined, undefined, getEffectiveQueueStart());
  };

  const parseBulkImport = (input: string): Task[] | null => {
      const lines = input.split('\n');
      const newTasks: Task[] = [];
      let found = false;

      for (const line of lines) {
          const match = line.match(/.*:\s*(.+?)\s*\((\d+)\s*m\)/i);
          if (match) {
             found = true;
             const title = match[1];
             const duration = parseInt(match[2]);
             newTasks.push({
                 id: generateId(),
                 title,
                 duration,
                 startTime: 0,
                 expectedPomodoros: calculateExpectedPomos(duration),
                 completedPomodoros: 0,
                 status: 'pending',
                 color: selectedColor,
                 timer: { remainingSeconds: settings.pomodoroDuration * 60, isRunning: false, mode: 'pomo' }
             });
          }
      }
      return found && newTasks.length > 0 ? newTasks : null;
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;

    let currentQueueStart = getEffectiveQueueStart();
    if (tasks.length === 0 && !currentQueueStart && !manualStartTime) {
        currentQueueStart = Date.now();
        setQueueStartTime(currentQueueStart);
    }

    const importedTasks = parseBulkImport(newTaskInput);
    if (importedTasks) {
        const combinedTasks = [...tasks, ...importedTasks];
        updateSchedule(combinedTasks, undefined, undefined, currentQueueStart);
        setNewTaskInput('');
        return;
    }

    const relativeRegex = /(.+?)\s+(before|after)\s+(.+)/i;
    const relMatch = newTaskInput.match(relativeRegex);
    let insertionIndex = tasks.length;
    let taskDefinition = newTaskInput;

    if (relMatch) {
        const keyword = relMatch[2].toLowerCase();
        const targetNameQuery = relMatch[3].toLowerCase();
        const targetIndex = tasks.findIndex(t => t.title.toLowerCase().includes(targetNameQuery));
        if (targetIndex !== -1) {
             taskDefinition = relMatch[1];
             insertionIndex = keyword === 'before' ? targetIndex : targetIndex + 1;
        }
    }

    const anchorForParse = currentQueueStart || Date.now(); 
    let title = taskDefinition;
    let duration = newTaskDuration;
    let anchoredStartTime: string | undefined;

    const smartParsed = parseSmartInput(taskDefinition, anchorForParse);
    title = smartParsed.title;
    if (smartParsed.duration) {
        duration = smartParsed.duration;
    }
    if (smartParsed.anchoredStartTime) {
        anchoredStartTime = smartParsed.anchoredStartTime;
    }

    if (duration <= 0) duration = 15;

    const newTask: Task = {
        id: generateId(),
        title: title,
        startTime: 0, 
        duration: duration,
        expectedPomodoros: calculateExpectedPomos(duration),
        completedPomodoros: 0,
        status: 'pending',
        color: selectedColor,
        anchoredStartTime: anchoredStartTime,
        timer: {
            remainingSeconds: settings.pomodoroDuration * 60,
            isRunning: false,
            mode: 'pomo'
        }
    };
    
    const newTaskList = [...tasks];
    newTaskList.splice(insertionIndex, 0, newTask);
    
    updateSchedule(newTaskList, undefined, undefined, currentQueueStart);
    setNewTaskInput('');
  };

  const handleSmartAdd = async () => {
    if (!newTaskInput.trim()) return;
    setIsAiLoading(true);

    let currentQueueStart = getEffectiveQueueStart();
    if (tasks.length === 0 && !currentQueueStart && !manualStartTime) {
        currentQueueStart = Date.now();
        setQueueStartTime(currentQueueStart);
    }

    try {
        const baseTime = tasks.length > 0 
            ? tasks[tasks.length - 1].startTime + (tasks[tasks.length - 1].duration * 60 * 1000)
            : (currentQueueStart || Date.now());

        const { tasks: aiTasks } = await parseNaturalLanguagePlan(newTaskInput, baseTime);
        
        let currentStart = baseTime;
        const newTasks: Task[] = aiTasks.map(t => {
            const duration = t.duration || (settings.pomodoroDuration + settings.shortBreakDuration);
            const task: Task = {
                id: generateId(),
                title: t.title || "Untitled Task",
                startTime: currentStart,
                duration: duration,
                expectedPomodoros: calculateExpectedPomos(duration),
                completedPomodoros: 0,
                status: 'pending',
                notes: t.notes,
                color: selectedColor,
                timer: {
                    remainingSeconds: settings.pomodoroDuration * 60,
                    isRunning: false,
                    mode: 'pomo'
                }
            };
            currentStart += duration * 60 * 1000;
            return task;
        });

        const combinedTasks = [...tasks, ...newTasks];
        updateSchedule(combinedTasks, undefined, undefined, currentQueueStart);
        setNewTaskInput('');
    } finally {
        setIsAiLoading(false);
    }
  };

  const handleCopyTasks = async () => {
      const text = tasks.map(t => {
          const start = formatTime(t.startTime);
          const end = formatTime(t.startTime + t.duration * 60000);
          return `${start} - ${end}: ${t.title} (${t.duration}m)`;
      }).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (err) {
          console.error("Failed to copy", err);
      }
  };

  const handleClearCompleted = () => {
      const remaining = tasks.filter(t => t.status !== 'completed');
      if (remaining.length === 0) {
          setQueueStartTime(undefined);
      }
      updateSchedule(remaining, undefined, undefined, getEffectiveQueueStart());
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      
      {/* Sidebar */}
      <div className="w-[48rem] flex flex-col border-r border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
             <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
                FlowState
                </h1>
                
                <div className="flex items-center space-x-1">
                    <button onClick={handleDeleteAllTasks} className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors" title="Delete All">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                    <button onClick={handleCopyTasks} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors" title="Copy">
                        {copyFeedback ? <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
                    </button>
                </div>
            </div>

            {/* Date Nav */}
            <div className="flex items-center justify-between mb-3 bg-slate-900 rounded-lg p-1 mx-1">
                <button onClick={() => handleDateChange(-1)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="text-center">
                    <span className="block text-xs font-semibold uppercase tracking-wider text-indigo-400">
                        {isToday ? 'Today' : selectedDate.toLocaleDateString(undefined, { weekday: 'long' })}
                    </span>
                    <span className="text-sm font-medium text-slate-300">
                        {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                </div>
                <button onClick={() => handleDateChange(1)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            
            {/* Start Time Input */}
            <div className="flex items-center space-x-2 mb-2 px-1">
                <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Start Plan At:</label>
                <input 
                    type="time" 
                    value={manualStartTime}
                    onChange={(e) => setManualStartTime(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-xs rounded px-2 py-1 text-slate-300 focus:border-indigo-500 outline-none w-full"
                />
            </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col">
          <TaskList 
            tasks={tasks} 
            activeTaskId={activeTaskId} 
            onSelectTask={handleSelectTask} 
            onDeleteTask={handleDeleteTask}
            onUpdateTask={handleUpdateTask}
            onCompleteTask={handleTaskComplete}
            onReorderTasks={handleReorderTasks}
          />
        </div>

        {/* Footer Add Form */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <form onSubmit={handleAddTask} className="flex flex-col gap-2">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <textarea 
                      value={newTaskInput}
                      onChange={(e) => setNewTaskInput(e.target.value)}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddTask(e);
                          }
                      }}
                      placeholder="Task name..."
                      rows={1}
                      className="w-full bg-slate-800 border border-slate-700 text-sm rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 resize-none overflow-hidden min-h-[40px]"
                      style={{ height: newTaskInput.split('\n').length > 1 ? 'auto' : '40px' }}
                    />
                    <button 
                      type="button"
                      onClick={handleSmartAdd}
                      disabled={isAiLoading || !newTaskInput}
                      className="absolute right-1 top-1 p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                      title="AI Plan"
                    >
                       {isAiLoading ? (
                           <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                       ) : (
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                       )}
                    </button>
                </div>
                
                <div className="relative w-20 group h-[40px]">
                     <input 
                      type="number" 
                      value={newTaskDuration}
                      min={1}
                      onChange={(e) => setNewTaskDuration(parseInt(e.target.value) || 0)}
                      className="w-full h-full bg-slate-800 border border-slate-700 text-sm rounded-lg pl-2 pr-6 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 text-center"
                    />
                    <span className="absolute right-1 top-2.5 text-[10px] text-slate-500 pointer-events-none">min</span>
                </div>

                <button 
                    type="submit"
                    disabled={!newTaskInput}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-50 transition-colors h-[40px]"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
            </div>
            
            {/* Extended Controls: Color & Clear */}
            <div className="flex items-center justify-between px-1">
                <div className="flex space-x-1.5">
                    {COLORS.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setSelectedColor(c)}
                            className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${selectedColor === c ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'}`}
                            style={{ backgroundColor: `var(--color-${c}, ${c === 'indigo' ? '#6366f1' : c === 'blue' ? '#3b82f6' : c === 'green' ? '#10b981' : c === 'purple' ? '#a855f7' : c === 'pink' ? '#ec4899' : '#f97316'})` }}
                        />
                    ))}
                </div>
                {tasks.some(t => t.status === 'completed') && (
                    <button type="button" onClick={handleClearCompleted} className="text-[10px] text-slate-500 hover:text-slate-300 underline">
                        Clear Done
                    </button>
                )}
            </div>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-12 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        <div className="w-full max-w-3xl h-full max-h-[800px]">
           <Timer 
             activeTask={activeTask}
             settings={settings}
             onTaskComplete={handleTaskComplete}
             onToggleTimer={handleToggleTimer}
             onSkipTimer={handleSkipTimer}
             totalPomosCompleted={totalPomosCompleted}
             totalPomosExpected={totalPomosExpected}
             onUpdateSettings={handleUpdateSettings}
           />
           
           <div className="mt-8 text-center text-slate-500 text-sm max-w-lg mx-auto">
             {!activeTask ? (
                <p>Select a task to start focusing.</p>
             ) : (
                <p>Timer is running. Stay in flow.</p>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}

export default App;
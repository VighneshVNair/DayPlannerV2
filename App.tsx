
import React, { useState, useEffect } from 'react';
import { Settings, Task } from './types';
import { recalculateSchedule, generateId, formatTime } from './services/scheduler';
import { parseNaturalLanguagePlan } from './services/gemini';
import { Timer } from './components/Timer';
import { TaskList } from './components/TaskList';
import { SettingsModal } from './components/SettingsModal';

const DEFAULT_SETTINGS: Settings = {
  pomodoroDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoStartBreaks: false,
  autoStartPomodoros: false,
};

// --- Smart Input Parser ---
const parseSmartInput = (input: string, startTime: number): { title: string, duration: number } | null => {
    const lower = input.toLowerCase();
    
    // 1. "until lunch" (Target 12:00 PM)
    if (lower.includes('until lunch')) {
        const title = input.replace(/until lunch/i, '').trim() || "Work";
        
        const start = new Date(startTime);
        const target = new Date(startTime);
        target.setHours(12, 0, 0, 0); 
        
        let diff = (target.getTime() - start.getTime()) / 60000;
        if (diff <= 0) return null;
        
        return { title, duration: Math.ceil(diff) };
    }

    // 2. "for half an hour"
    const halfHourRegex = /for\s+half\s+(?:an\s+)?hour/i;
    if (halfHourRegex.test(input)) {
        const title = input.replace(halfHourRegex, '').trim() || "Task";
        return { title, duration: 30 };
    }

    // 3. "for an hour"
    const anHourRegex = /for\s+(?:an?|one)\s+hour/i;
    if (anHourRegex.test(input)) {
        const title = input.replace(anHourRegex, '').trim() || "Task";
        return { title, duration: 60 };
    }

    // 4. "until [time]"
    const untilRegex = /until\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const untilMatch = input.match(untilRegex);
    if (untilMatch) {
        const title = input.replace(untilMatch[0], '').trim() || "Task";
        
        let h = parseInt(untilMatch[1]);
        const m = parseInt(untilMatch[2] || '0');
        const amp = untilMatch[3]?.toLowerCase();

        if (amp === 'pm' && h < 12) h += 12;
        if (amp === 'am' && h === 12) h = 0;

        const start = new Date(startTime);
        const currentH = start.getHours();
        
        // Heuristic: if AM/PM missing, infer based on start time
        if (!amp && h < 12 && h < currentH) h += 12;

        const target = new Date(startTime);
        target.setHours(h, m, 0, 0);
        
        if (target.getTime() <= start.getTime()) {
             if (!amp && h < 12) {
                 target.setHours(target.getHours() + 12);
             }
             if (target.getTime() <= start.getTime()) {
                 target.setDate(target.getDate() + 1);
             }
        }

        let diff = (target.getTime() - start.getTime()) / 60000;
        if (diff <= 0) diff = 15; 

        return { title, duration: Math.ceil(diff) };
    }
    
    // 5. "for X min/h"
    const durationRegex = /for\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hour|hours)/i;
    const match = input.match(durationRegex);
    if (match) {
        const title = input.replace(match[0], '').trim() || "Task";
        const val = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        let duration = 0;
        if (unit.startsWith('h')) {
            duration = Math.ceil(val * 60);
        } else {
            duration = Math.ceil(val);
        }
        return { title, duration };
    }

    return null;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Anchor time for the first task in the queue. Stabilizes reordering.
  const [queueStartTime, setQueueStartTime] = useState<number | undefined>(undefined);

  const [newTaskInput, setNewTaskInput] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(DEFAULT_SETTINGS.pomodoroDuration);
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Recalculate schedule periodically
  useEffect(() => {
    if (tasks.length > 0) {
        updateSchedule(tasks, undefined, undefined, queueStartTime);
    }
  }, [currentTime, activeTaskId]); // Dependencies triggering updates

  useEffect(() => {
    if (newTaskDuration === DEFAULT_SETTINGS.pomodoroDuration) {
        setNewTaskDuration(settings.pomodoroDuration);
    }
  }, [settings.pomodoroDuration]);

  const activeTask = tasks.find(t => t.id === activeTaskId);

  // Stats calculation
  const totalPomosExpected = tasks.reduce((acc, t) => acc + t.expectedPomodoros, 0);
  const totalPomosCompleted = tasks.reduce((acc, t) => acc + t.completedPomodoros, 0);
  // Productivity moved to Timer component visual, but data prepared here.

  // --- Helpers ---
  
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
          planStart ?? queueStartTime
      );
      setTasks(schedule);
  };

  // --- Handlers ---

  const handleReorderTasks = (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      
      const newTasks = [...tasks];
      const [movedTask] = newTasks.splice(fromIndex, 1);
      newTasks.splice(toIndex, 0, movedTask);
      
      // Pass existing queueStartTime to preserve anchor
      updateSchedule(newTasks);
  };

  const handleTaskComplete = (taskId: string) => {
    const now = Date.now();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const isAlreadyCompleted = task.status === 'completed';
    const newStatus: Task['status'] = isAlreadyCompleted ? 'pending' : 'completed';
    
    let newDuration = task.duration;
    
    if (!isAlreadyCompleted) {
         // Apply duration snap if task has ostensibly started (startTime < now).
         // This handles:
         // 1. Active Task: Snaps end to NOW (pushes up next tasks if early, or pushes down if late).
         // 2. Pending (but past start time): Snaps end to NOW.
         // 3. Future Tasks: Reset duration to 0 (skipped).
         if (task.startTime <= now) {
             const elapsedMinutes = Math.ceil((now - task.startTime) / 60000);
             newDuration = Math.max(1, elapsedMinutes);
         } else {
             newDuration = 0;
         }
    }

    if (!isAlreadyCompleted && taskId === activeTaskId) {
        setActiveTaskId(undefined);
    }

    const updatedTasks = tasks.map(t => 
      t.id === taskId ? { ...t, status: newStatus, duration: newDuration } : t
    );
    
    const nextActiveId = (!isAlreadyCompleted && taskId === activeTaskId) ? undefined : activeTaskId;

    // Recalculate
    const schedule = recalculateSchedule(
        updatedTasks, 
        !isAlreadyCompleted ? taskId : undefined, 
        !isAlreadyCompleted ? now : undefined,
        nextActiveId,
        now,
        queueStartTime
    );
    setTasks(schedule);
  };

  const handlePomodoroComplete = (taskId: string) => {
    setTasks(prev => prev.map(t => 
        t.id === taskId 
            ? { ...t, completedPomodoros: t.completedPomodoros + 1 } 
            : t
    ));
  };

  const handleSelectTask = (id: string) => {
    setActiveTaskId(id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'active' as const } : t));
  };

  const handleDeleteTask = (id: string) => {
      const remaining = tasks.filter(t => t.id !== id);
      // If we delete the first task, does queue start time matter?
      // Yes, we keep the anchor.
      if (remaining.length === 0) {
          setQueueStartTime(undefined);
          setTasks([]);
      } else {
          updateSchedule(remaining);
      }
  };
  
  const handleDeleteAllTasks = () => {
    if (window.confirm("Are you sure you want to delete all tasks?")) {
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
              newTask.expectedPomodoros = Math.ceil(updates.duration / settings.pomodoroDuration);
          }
          return newTask;
      });
      updateSchedule(updatedTasks);
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
                 expectedPomodoros: Math.ceil(duration / settings.pomodoroDuration),
                 completedPomodoros: 0,
                 status: 'pending'
             });
          }
      }
      return found && newTasks.length > 0 ? newTasks : null;
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;

    // 0. Initialize Queue Start Time if Empty
    let currentQueueStart = queueStartTime;
    if (tasks.length === 0 && !currentQueueStart) {
        currentQueueStart = Date.now();
        setQueueStartTime(currentQueueStart);
    }

    // 1. Check for Bulk Import
    const importedTasks = parseBulkImport(newTaskInput);
    if (importedTasks) {
        const combinedTasks = [...tasks, ...importedTasks];
        updateSchedule(combinedTasks, undefined, undefined, currentQueueStart);
        setNewTaskInput('');
        return;
    }

    // 2. Check for Relative Insertion
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

    // Determine duration
    const anchorForParse = currentQueueStart || Date.now(); // Fallback
    let title = taskDefinition;
    let duration = newTaskDuration;

    const smartParsed = parseSmartInput(taskDefinition, anchorForParse);
    if (smartParsed) {
        title = smartParsed.title;
        duration = smartParsed.duration;
    }
    if (duration <= 0) duration = 15;

    const newTask: Task = {
        id: generateId(),
        title: title,
        startTime: 0, // Calculated by scheduler
        duration: duration,
        expectedPomodoros: Math.ceil(duration / settings.pomodoroDuration),
        completedPomodoros: 0,
        status: 'pending'
    };
    
    const newTaskList = [...tasks];
    newTaskList.splice(insertionIndex, 0, newTask);
    
    updateSchedule(newTaskList, undefined, undefined, currentQueueStart);
    setNewTaskInput('');
  };

  const handleSmartAdd = async () => {
    if (!newTaskInput.trim()) return;
    setIsAiLoading(true);

    // Initialize queue start if needed
    let currentQueueStart = queueStartTime;
    if (tasks.length === 0 && !currentQueueStart) {
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
            const duration = t.duration || settings.pomodoroDuration;
            const task: Task = {
                id: generateId(),
                title: t.title || "Untitled Task",
                startTime: currentStart,
                duration: duration,
                expectedPomodoros: Math.ceil(duration / settings.pomodoroDuration),
                completedPomodoros: 0,
                status: 'pending',
                notes: t.notes
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
      updateSchedule(remaining);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      
      {/* Sidebar */}
      <div className="w-96 flex flex-col border-r border-slate-800 bg-slate-950/50 backdrop-blur-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
              FlowState
            </h1>
          </div>
          <div className="flex items-center space-x-1">
             <button
                 onClick={handleDeleteAllTasks}
                 className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                 title="Delete All Tasks"
             >
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             </button>

             <button
               onClick={handleCopyTasks}
               className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors relative"
               title="Copy to Clipboard"
             >
                {copyFeedback ? (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                )}
             </button>
             
             <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Settings"
             >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
             </button>
          </div>
        </div>

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
                      placeholder="Task, 'Import', 'Meeting before Lunch'..."
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
                
                <div className="relative w-24 group h-[40px]">
                     <input 
                      type="number" 
                      value={newTaskDuration}
                      min={1}
                      onChange={(e) => setNewTaskDuration(parseInt(e.target.value) || 0)}
                      className="w-full h-full bg-slate-800 border border-slate-700 text-sm rounded-lg pl-2 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 text-center"
                    />
                    <span className="absolute right-2 top-2 text-xs text-slate-500 pointer-events-none">min</span>
                </div>

                <button 
                    type="submit"
                    disabled={!newTaskInput}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-50 transition-colors h-[40px]"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
            </div>
            
            <div className="text-[10px] text-slate-500 flex justify-between px-1">
                <span>{Math.ceil(newTaskDuration / settings.pomodoroDuration)} pomodoros</span>
                {tasks.some(t => t.status === 'completed') && (
                    <button type="button" onClick={handleClearCompleted} className="hover:text-slate-300 underline">
                        Clear Done
                    </button>
                )}
            </div>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
        <div className="w-full max-w-2xl h-full max-h-[700px]">
           <Timer 
             activeTask={activeTask}
             settings={settings}
             onTaskComplete={handleTaskComplete}
             onPomodoroComplete={handlePomodoroComplete}
             totalPomosCompleted={totalPomosCompleted}
             totalPomosExpected={totalPomosExpected}
           />
           
           <div className="mt-8 text-center text-slate-500 text-sm max-w-lg mx-auto">
             {!activeTask ? (
                <p>Add tasks to your plan.</p>
             ) : (
                <p>Timer is running. Click "Complete Task" when you are done to update the schedule.</p>
             )}
           </div>
        </div>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={setSettings}
      />
    </div>
  );
}

export default App;

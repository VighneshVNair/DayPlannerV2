
import React, { useState, useRef, useEffect } from 'react';
import { Task } from '../types';
import { formatTime } from '../services/scheduler';

interface TaskListProps {
  tasks: Task[];
  activeTaskId: string | undefined;
  onSelectTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onCompleteTask: (id: string) => void;
  onReorderTasks: (fromIndex: number, toIndex: number) => void;
}

const COLORS = ['indigo', 'blue', 'green', 'purple', 'pink', 'orange'];

export const TaskList: React.FC<TaskListProps> = ({ 
  tasks, 
  activeTaskId, 
  onSelectTask, 
  onDeleteTask,
  onUpdateTask,
  onCompleteTask,
  onReorderTasks
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTaskId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingTaskId]);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>No tasks planned for this day. Add one to get started.</p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    
    if (draggedIndex !== dropIndex) {
      onReorderTasks(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const moveUp = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index > 0) onReorderTasks(index, index - 1);
  };

  const moveDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index < tasks.length - 1) onReorderTasks(index, index + 1);
  };

  const startEditing = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (task.status === 'completed') return;
    setEditingTaskId(task.id);
    setEditTitle(task.title);
  };

  const saveTitle = () => {
    if (editingTaskId && editTitle.trim()) {
      onUpdateTask(editingTaskId, { title: editTitle.trim() });
    }
    setEditingTaskId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveTitle();
    } else if (e.key === 'Escape') {
      setEditingTaskId(null);
    }
  };

  // Helper for colors
  const getTaskStyles = (color: string | undefined, isActive: boolean, isCompleted: boolean) => {
     const c = color || 'indigo';
     
     const colorMap: Record<string, { bg: string, border: string, activeBg: string }> = {
         'indigo': { bg: 'bg-indigo-900/30', border: 'border-indigo-500/30', activeBg: 'bg-indigo-900/60' },
         'blue': { bg: 'bg-blue-900/30', border: 'border-blue-500/30', activeBg: 'bg-blue-900/60' },
         'green': { bg: 'bg-emerald-900/30', border: 'border-emerald-500/30', activeBg: 'bg-emerald-900/60' },
         'purple': { bg: 'bg-purple-900/30', border: 'border-purple-500/30', activeBg: 'bg-purple-900/60' },
         'pink': { bg: 'bg-pink-900/30', border: 'border-pink-500/30', activeBg: 'bg-pink-900/60' },
         'orange': { bg: 'bg-orange-900/30', border: 'border-orange-500/30', activeBg: 'bg-orange-900/60' },
     };

     const styles = colorMap[c] || colorMap['indigo'];

     if (isCompleted) {
         return `bg-slate-900/50 border-slate-800 opacity-60 grayscale`;
     }

     if (isActive) {
         return `${styles.activeBg} border-l-4 border-l-${c}-500 border-y border-r ${styles.border}`;
     }

     return `${styles.bg} border-l-4 border-l-${c}-500/50 border-y border-r border-transparent hover:border-${c}-500/30`;
  };

  return (
    <div className="space-y-3 pb-20">
      {tasks.map((task, index) => {
        const isActive = task.id === activeTaskId;
        const isCompleted = task.status === 'completed';
        const isEditing = editingTaskId === task.id;
        const endTime = task.startTime + (task.duration * 60 * 1000);
        
        // Late detection: Only relevant if active and running over
        const isLate = !isCompleted && isActive && Date.now() > endTime;
        
        const containerClasses = getTaskStyles(task.color, isActive, isCompleted);
        const isAnchored = !!task.anchoredStartTime;

        return (
          <div 
            key={task.id}
            draggable={!isEditing}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => !isCompleted && !isEditing && onSelectTask(task.id)}
            className={`
              group relative flex items-center p-3 transition-all duration-200 
              ${containerClasses}
              ${isAnchored ? 'rounded-tr-sm rounded-br-[2rem] border-r-[4px] border-r-slate-600 border-double shadow-lg' : 'rounded-r-xl'}
              ${isCompleted ? '' : 'cursor-pointer'}
              ${isLate ? 'ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : ''}
              ${draggedIndex === index ? 'opacity-40 border-dashed border-slate-600' : ''}
            `}
          >
             {/* Controls Column (Drag + Up/Down) */}
             <div className="flex flex-col items-center justify-center mr-2 space-y-1">
                 <button 
                    onClick={(e) => moveUp(e, index)}
                    disabled={index === 0}
                    className={`text-slate-500 hover:text-white disabled:opacity-0 transition-opacity p-0.5`}
                 >
                     <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                 </button>
                 
                 <div 
                    className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300"
                    onClick={(e) => e.stopPropagation()}
                 >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                 </div>

                 <button 
                    onClick={(e) => moveDown(e, index)}
                    disabled={index === tasks.length - 1}
                    className={`text-slate-500 hover:text-white disabled:opacity-0 transition-opacity p-0.5`}
                 >
                     <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                 </button>
             </div>

             {/* Complete Checkbox */}
             <div className="flex items-center justify-center px-2">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onCompleteTask(task.id);
                    }}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isCompleted 
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]' 
                        : 'border-slate-500 hover:border-white bg-black/20'
                    }`}
                    title={isCompleted ? "Mark as pending" : "Mark as complete"}
                >
                    {isCompleted && (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </button>
             </div>

            {/* Time Column */}
            <div className="flex flex-col items-center mr-4 min-w-[60px]">
              <div className="flex items-center gap-1">
                 {isAnchored && !isEditing && (
                     <svg className="w-3 h-3 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                 )}
                 <span className={`text-xs font-mono ${isActive ? 'text-white font-bold' : isAnchored ? 'text-indigo-300 font-medium' : 'text-slate-400'}`}>
                    {formatTime(task.startTime)}
                 </span>
              </div>
              <div className={`w-px h-4 my-1 ${isAnchored ? 'bg-indigo-500/50' : 'bg-white/10'}`}></div>
              <span className="text-xs font-mono text-slate-500">
                {formatTime(endTime)}
              </span>
            </div>

            {/* Task Info */}
            <div className="flex-1 min-w-0">
              <div className="mb-1">
                {isEditing ? (
                  <div className="space-y-3">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-black/30 border border-white/20 rounded px-2 py-1 text-white focus:outline-none focus:border-white/50"
                      />
                      
                      <div className="flex items-center justify-between" onMouseDown={(e) => e.preventDefault()}>
                          {/* Color Picker */}
                          <div className="flex space-x-1.5">
                              {COLORS.map(c => (
                                  <button
                                      key={c}
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          onUpdateTask(task.id, { color: c });
                                      }}
                                      className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${task.color === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'}`}
                                      style={{ backgroundColor: `var(--color-${c}, ${c === 'indigo' ? '#6366f1' : c === 'blue' ? '#3b82f6' : c === 'green' ? '#10b981' : c === 'purple' ? '#a855f7' : c === 'pink' ? '#ec4899' : '#f97316'})` }}
                                  />
                              ))}
                          </div>
                          
                          {/* Anchor Control */}
                          <div className="flex items-center space-x-2 bg-slate-800/50 rounded px-2 py-0.5 border border-slate-700">
                             <span className="text-[10px] text-slate-400 font-medium">Anchor:</span>
                             <input 
                                type="time"
                                value={task.anchoredStartTime || ''}
                                onChange={(e) => onUpdateTask(task.id, { anchoredStartTime: e.target.value || undefined })}
                                className="bg-transparent text-[10px] text-white focus:outline-none w-16 text-right"
                             />
                             <button 
                                onClick={() => onUpdateTask(task.id, { anchoredStartTime: undefined })}
                                className={`text-slate-500 hover:text-white ${!task.anchoredStartTime && 'hidden'}`}
                                title="Remove Anchor"
                             >
                                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                          </div>
                      </div>
                  </div>
                ) : (
                  <div className="flex items-center w-full h-7">
                    <h3 
                        onClick={(e) => startEditing(e, task)}
                        className={`font-medium truncate flex-1 hover:text-white transition-colors ${isCompleted ? 'line-through text-slate-500' : 'text-slate-100'}`}
                        title="Click to edit details or set anchor"
                    >
                        {task.title}
                    </h3>
                    {isLate && <span className="text-[10px] text-red-200 font-bold ml-2 bg-red-600 px-1.5 py-0.5 rounded shadow-sm animate-pulse">LATE</span>}
                  </div>
                )}
              </div>
              
              {!isEditing && (
                <div className="flex items-center text-xs text-slate-400 space-x-4">
                    <div className="flex items-center group/duration" onClick={(e) => e.stopPropagation()}>
                        <svg className="w-3 h-3 mr-1 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        {isCompleted ? (
                            <span>{task.duration}m</span>
                        ) : (
                            <div className="flex items-center">
                                <input 
                                    type="number" 
                                    className="w-10 bg-transparent border-b border-white/10 focus:border-white/50 focus:outline-none text-slate-300 text-center hover:border-white/30 transition-colors"
                                    value={task.duration}
                                    min={0}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val) && val >= 0) onUpdateTask(task.id, { duration: val });
                                    }}
                                />
                                <span className="ml-1 opacity-70">min</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center" title="Completed / Expected Pomodoros">
                         <svg className={`w-3 h-3 mr-1 ${task.timer.isRunning ? 'text-emerald-400 animate-pulse' : 'opacity-70'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        <span className={task.completedPomodoros >= task.expectedPomodoros ? "text-emerald-400 font-medium" : ""}>
                            {task.completedPomodoros}/{task.expectedPomodoros}
                        </span>
                    </div>
                </div>
              )}
            </div>

            {/* Action Buttons (Visible on Hover) */}
            {!isCompleted && !isEditing && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm shadow-sm border border-white/10 rounded-lg flex items-center p-1 space-x-1">
                     <button 
                        onClick={(e) => startEditing(e, task)}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 rounded hover:bg-white/10 transition-colors"
                        title="Anchor / Edit"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                        className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-white/10 transition-colors"
                        title="Delete"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

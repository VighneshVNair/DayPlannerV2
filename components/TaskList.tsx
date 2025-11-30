
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
        <p>No tasks planned yet. Add one to get started.</p>
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

  return (
    <div className="space-y-3 pb-20">
      {tasks.map((task, index) => {
        const isActive = task.id === activeTaskId;
        const isCompleted = task.status === 'completed';
        const isEditing = editingTaskId === task.id;
        const endTime = task.startTime + (task.duration * 60 * 1000);
        
        // Late detection: Only relevant if active and running over
        const isLate = !isCompleted && isActive && Date.now() > endTime;

        return (
          <div 
            key={task.id}
            draggable={!isEditing}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => !isCompleted && !isEditing && onSelectTask(task.id)}
            className={`
              group relative flex items-center p-3 rounded-xl border transition-all duration-200 
              ${isActive ? 'bg-indigo-900/20 border-indigo-500/50 ring-1 ring-indigo-500/50' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}
              ${isCompleted ? 'opacity-50 grayscale' : 'cursor-pointer'}
              ${isLate ? 'border-red-900/50 bg-red-900/5' : ''}
              ${draggedIndex === index ? 'opacity-40 border-dashed border-slate-600' : ''}
            `}
          >
             {/* Controls Column (Drag + Up/Down) */}
             <div className="flex flex-col items-center justify-center mr-2 space-y-1">
                 <button 
                    onClick={(e) => moveUp(e, index)}
                    disabled={index === 0}
                    className={`text-slate-600 hover:text-indigo-400 disabled:opacity-0 transition-opacity p-0.5`}
                 >
                     <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                 </button>
                 
                 <div 
                    className="cursor-grab active:cursor-grabbing text-slate-700 hover:text-slate-500"
                    onClick={(e) => e.stopPropagation()}
                 >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                 </div>

                 <button 
                    onClick={(e) => moveDown(e, index)}
                    disabled={index === tasks.length - 1}
                    className={`text-slate-600 hover:text-indigo-400 disabled:opacity-0 transition-opacity p-0.5`}
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
                        : 'border-slate-600 hover:border-indigo-400 bg-transparent'
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
              <span className={`text-xs font-mono ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>
                {formatTime(task.startTime)}
              </span>
              <div className="w-px h-4 bg-slate-800 my-1"></div>
              <span className="text-xs font-mono text-slate-600">
                {formatTime(endTime)}
              </span>
            </div>

            {/* Task Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1 h-7">
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-slate-800 border border-indigo-500 rounded px-2 text-white focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center w-full">
                    <h3 
                        onClick={(e) => startEditing(e, task)}
                        className={`font-medium truncate flex-1 hover:text-indigo-300 transition-colors ${isCompleted ? 'line-through text-slate-500' : 'text-slate-200'}`}
                        title="Click to edit title"
                    >
                        {task.title}
                    </h3>
                    {isLate && <span className="text-[10px] text-red-500 font-bold ml-2 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-900/50">LATE</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center text-xs text-slate-500 space-x-4">
                 <div className="flex items-center group/duration" onClick={(e) => e.stopPropagation()}>
                    <svg className="w-3 h-3 mr-1 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    {isCompleted ? (
                        <span>{task.duration}m</span>
                    ) : (
                        <div className="flex items-center">
                            <input 
                                type="number" 
                                className="w-10 bg-transparent border-b border-slate-700 focus:border-indigo-500 focus:outline-none text-slate-300 text-center hover:border-slate-600 transition-colors"
                                value={task.duration}
                                min={1}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val > 0) onUpdateTask(task.id, { duration: val });
                                }}
                            />
                            <span className="ml-1 text-slate-600">min</span>
                        </div>
                    )}
                 </div>
                 <div className="flex items-center" title="Completed / Expected Pomodoros">
                    <svg className="w-3 h-3 mr-1 text-red-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    <span className={task.completedPomodoros >= task.expectedPomodoros ? "text-emerald-400 font-medium" : ""}>
                        {task.completedPomodoros}/{task.expectedPomodoros}
                    </span>
                 </div>
              </div>
            </div>

            {/* Action Buttons (Visible on Hover) */}
            {!isCompleted && !isEditing && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 shadow-sm">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                        className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800"
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

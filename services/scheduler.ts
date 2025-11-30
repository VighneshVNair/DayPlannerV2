
import { Task } from '../types';

/**
 * Recalculates start times for subsequent tasks.
 * - Enforces sequential flow from planStartTime.
 * - Pushes schedule if active task is overtime.
 */
export const recalculateSchedule = (
  tasks: Task[],
  completedTaskId?: string,
  actualEndTime?: number,
  activeTaskId?: string,
  currentTime?: number,
  planStartTime?: number
): Task[] => {
  const newTasks = tasks.map(t => ({ ...t }));
  
  // 1. Establish anchor time
  // If planStartTime is provided, that's our rigid start. 
  // Otherwise default to now, but usually planStartTime should be set when first task is added.
  let currentTracker = planStartTime || Date.now();
  
  let firstPendingIndex = -1;

  for (let i = 0; i < newTasks.length; i++) {
    const task = newTasks[i];
    
    // Assign start time based on the tracker
    task.startTime = currentTracker;
    
    const taskDurationMs = task.duration * 60 * 1000;
    let effectiveEnd = task.startTime + taskDurationMs;

    // Handle Active Task Overtime
    if (task.id === activeTaskId && currentTime) {
        // If the active task is running longer than planned, the "effective" end for scheduling
        // subsequent tasks is "Now" (shifting them down). 
        // We don't change the task's stored duration permanently here (that happens on completion),
        // but we push the tracker.
        if (currentTime > effectiveEnd) {
            effectiveEnd = currentTime;
        }
    }

    // Update tracker for next task
    currentTracker = effectiveEnd;

    if (task.status !== 'completed' && firstPendingIndex === -1) {
        firstPendingIndex = i;
    }
  }

  return newTasks;
};

export const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

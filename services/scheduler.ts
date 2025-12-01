
import { Task } from '../types';

/**
 * Recalculates start times for subsequent tasks.
 * - Enforces sequential flow from planStartTime.
 * - Respects anchoredStartTime by compressing previous tasks if needed.
 * - Pushes schedule if active task is overtime.
 */
export const recalculateSchedule = (
  tasks: Task[],
  completedTaskId?: string,
  actualEndTime?: number,
  activeTaskId?: string,
  currentTime?: number,
  planStartTime?: number,
  referenceDate?: Date
): Task[] => {
  const newTasks = tasks.map(t => ({ ...t }));
  
  // 1. Establish anchor time
  let currentTracker = planStartTime || Date.now();
  let firstPendingIndex = -1;

  for (let i = 0; i < newTasks.length; i++) {
    const task = newTasks[i];
    
    // --- Anchor Logic ---
    if (task.anchoredStartTime && referenceDate) {
        const [h, m] = task.anchoredStartTime.split(':').map(Number);
        const anchorDate = new Date(referenceDate);
        anchorDate.setHours(h, m, 0, 0);
        const anchorTs = anchorDate.getTime();

        // If the calculated start time (currentTracker) pushes PAST the anchor,
        // we need to compress the previous task to make space.
        if (currentTracker > anchorTs) {
            // Find the previous task to compress
            if (i > 0) {
                const prevTask = newTasks[i-1];
                
                // Calculate how much we need to shave off
                const overrunMs = currentTracker - anchorTs;
                const overrunMins = Math.ceil(overrunMs / 60000);
                
                // Compress previous task
                if (prevTask.duration > overrunMins) {
                     prevTask.duration -= overrunMins;
                     // Reset tracker to anchor
                     currentTracker = anchorTs;
                } else {
                     // If previous task is too short, we squash it to 0
                     currentTracker = Math.max(anchorTs, currentTracker - (prevTask.duration * 60000));
                     prevTask.duration = 0;
                }
            } else {
                // If it's the first task, just set it to anchor (gap or jump)
                // (Though usually handled by planStartTime, this enforces the anchor)
            }
        } else {
            // Gap exists (we are early), jump forward to anchor.
            currentTracker = Math.max(currentTracker, anchorTs);
        }
    }

    // Assign start time based on the tracker
    task.startTime = currentTracker;
    
    const taskDurationMs = task.duration * 60 * 1000;
    let effectiveEnd = task.startTime + taskDurationMs;

    // Handle Active Task Overtime
    if (task.id === activeTaskId && currentTime) {
        // If the active task is running longer than planned, the "effective" end for scheduling
        // subsequent tasks is "Now".
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

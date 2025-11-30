export interface Task {
  id: string;
  title: string;
  startTime: number; // Timestamp
  duration: number; // In minutes
  completedPomodoros: number;
  expectedPomodoros: number;
  status: 'pending' | 'active' | 'completed';
  notes?: string;
}

export interface Settings {
  pomodoroDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
}

export enum TimerState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  BREAK = 'BREAK',
}

export interface PlanRequest {
  naturalLanguageInput: string;
  currentTime: string;
}
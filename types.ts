
export interface TimerData {
  remainingSeconds: number;
  isRunning: boolean;
  lastStartedAt?: number; // Timestamp for accurate delta calculation
  mode: 'pomo' | 'short' | 'long';
}

export interface Task {
  id: string;
  title: string;
  startTime: number; // Timestamp
  duration: number; // In minutes
  completedPomodoros: number;
  expectedPomodoros: number;
  status: 'pending' | 'active' | 'completed';
  notes?: string;
  color?: string; // Hex code or tailwind class reference
  anchoredStartTime?: string; // "HH:MM" 24h format
  timer: TimerData; // Persistent timer state
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

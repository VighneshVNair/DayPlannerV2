import React from 'react';
import { Settings } from '../types';
import { Button } from './Button';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (newSettings: Settings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [tempSettings, setTempSettings] = React.useState<Settings>(settings);

  React.useEffect(() => {
    setTempSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-white mb-6">Timer Settings</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Pomodoro Duration (min)</label>
            <input 
              type="number" 
              value={tempSettings.pomodoroDuration}
              onChange={(e) => setTempSettings({...tempSettings, pomodoroDuration: parseInt(e.target.value) || 25})}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Short Break (min)</label>
            <input 
              type="number" 
              value={tempSettings.shortBreakDuration}
              onChange={(e) => setTempSettings({...tempSettings, shortBreakDuration: parseInt(e.target.value) || 5})}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Long Break (min)</label>
            <input 
              type="number" 
              value={tempSettings.longBreakDuration}
              onChange={(e) => setTempSettings({...tempSettings, longBreakDuration: parseInt(e.target.value) || 15})}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium text-slate-400">Auto-start Breaks</span>
            <button 
              onClick={() => setTempSettings({...tempSettings, autoStartBreaks: !tempSettings.autoStartBreaks})}
              className={`w-11 h-6 flex items-center rounded-full transition-colors ${tempSettings.autoStartBreaks ? 'bg-indigo-600' : 'bg-slate-700'}`}
            >
              <span className={`w-4 h-4 rounded-full bg-white transform transition-transform ml-1 ${tempSettings.autoStartBreaks ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-8">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(tempSettings); onClose(); }}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
};
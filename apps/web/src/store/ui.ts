import { create } from "zustand";
import dayjs from "dayjs";

export type Tab = "inbox"|"calendar"|"schedule"|"matrix"|"reminders"|"settings";

export type PomodoroMode = "focus" | "break";

type UIState = {
  tab: Tab;
  selectedDate: string; // YYYY-MM-DD
  setTab: (t: Tab) => void;
  setSelectedDate: (d: string) => void;

  // Focus / Pomodoro
  focusTaskId: string | null;
  pomodoroMode: PomodoroMode;
  pomodoroRunning: boolean;
  pomodoroEndsAt: number | null; // ms timestamp
  startFocus: (taskId: string) => void;
  stopFocus: () => void;
  startPomodoro: (minutes?: number) => void;
  startBreak: (minutes?: number) => void;
  tick: () => void;
};

export const useUI = create<UIState>((set, get) => ({
  tab: "inbox",
  selectedDate: dayjs().format("YYYY-MM-DD"),
  setTab: (tab) => set({ tab }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),

  focusTaskId: null,
  pomodoroMode: "focus",
  pomodoroRunning: false,
  pomodoroEndsAt: null,

  startFocus: (taskId) => set({ focusTaskId: taskId }),
  stopFocus: () => set({ focusTaskId: null, pomodoroRunning: false, pomodoroEndsAt: null }),

  startPomodoro: (minutes = 25) => {
    const ends = Date.now() + minutes * 60_000;
    set({ pomodoroMode: "focus", pomodoroRunning: true, pomodoroEndsAt: ends });
  },

  startBreak: (minutes = 5) => {
    const ends = Date.now() + minutes * 60_000;
    set({ pomodoroMode: "break", pomodoroRunning: true, pomodoroEndsAt: ends });
  },

  tick: () => {
    const { pomodoroRunning, pomodoroEndsAt } = get();
    if (!pomodoroRunning || !pomodoroEndsAt) return;
    if (Date.now() >= pomodoroEndsAt) {
      // auto stop; UI offers next action
      set({ pomodoroRunning: false });
    }
  }
}));

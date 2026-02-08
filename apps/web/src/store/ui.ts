import { create } from "zustand";
import dayjs from "dayjs";

export type Tab = "inbox"|"calendar"|"schedule"|"matrix"|"reminders"|"settings";

type UIState = {
  tab: Tab;
  selectedDate: string; // YYYY-MM-DD
  setTab: (t: Tab) => void;
  setSelectedDate: (d: string) => void;
};

export const useUI = create<UIState>((set) => ({
  tab: "inbox",
  selectedDate: dayjs().format("YYYY-MM-DD"),
  setTab: (tab) => set({ tab }),
  setSelectedDate: (selectedDate) => set({ selectedDate })
}));

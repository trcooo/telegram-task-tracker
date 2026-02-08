import { create } from "zustand";

export type SmartView = "today"|"next7"|"overdue"|"inbox"|"all"|"done";

type Filters = {
  smart: SmartView;
  listId: string | null;
  tag: string | null;
  setSmart: (v: SmartView) => void;
  setList: (id: string | null) => void;
  setTag: (t: string | null) => void;
  reset: () => void;
};

export const useFilters = create<Filters>((set) => ({
  smart: "inbox",
  listId: null,
  tag: null,
  setSmart: (smart) => set({ smart, listId: null, tag: null }),
  setList: (listId) => set({ listId, smart: "all", tag: null }),
  setTag: (tag) => set({ tag, smart: "all", listId: null }),
  reset: () => set({ smart: "inbox", listId: null, tag: null })
}));

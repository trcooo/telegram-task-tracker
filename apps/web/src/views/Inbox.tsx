import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { List, Task } from "@pp/shared";
import { api } from "../lib/api";
import { useFilters } from "../store/filters";
import { useUI } from "../store/ui";
import TaskCard from "./components/TaskCard";
import QuickAdd from "./components/QuickAdd";

export default function Inbox({ lists }: { lists: List[] }) {
  const qc = useQueryClient();
  const filters = useFilters();
  const setTab = useUI((s) => s.setTab);
  const selectedDate = useUI((s) => s.selectedDate);

  const tasksQ = useQuery({
    queryKey: ["tasks", filters.smart, filters.listId, filters.tag],
    queryFn: async () => {
      if (filters.smart === "today") return api.tasks({ view: "today" });
      if (filters.smart === "overdue") return api.tasks({ view: "overdue" });
      if (filters.smart === "done") return api.tasks({ view: "done" });
      if (filters.smart === "inbox") return api.tasks({ view: "inbox" });
      return api.tasks({ view: "all" });
    }
  });

  const tasks = useMemo(() => {
    let t = (tasksQ.data || []) as Task[];
    if (filters.listId) t = t.filter(x => x.listId === filters.listId);
    if (filters.tag) t = t.filter(x => (x.tags || []).includes(filters.tag!));
    if (filters.smart === "next7") {
      const start = dayjs().startOf("day");
      const end = start.add(7, "day");
      t = t.filter(x => {
        const when = x.startAt || (x.date ? `${x.date}T${x.time || "09:00"}:00` : null);
        if (!when) return false;
        const d = dayjs(when);
        return d.isAfter(start) && d.isBefore(end);
      });
    }
    return t;
  }, [tasksQ.data, filters.smart, filters.listId, filters.tag]);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api.updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] })
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] })
  });

  return (
    <div className="space-y-3">
      <QuickAdd lists={lists} onCreated={() => qc.invalidateQueries({ queryKey: ["tasks"] })} />

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Task list</div>
            <div className="text-xs text-slate-500">Tap a card for details. Actions on the right.</div>
          </div>
          <button
            onClick={() => { setTab("schedule"); }}
            className="text-xs px-3 py-2 rounded-xl bg-slate-100"
          >
            Go to Day
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            lists={lists}
            onToggleDone={() => update.mutate({ id: t.id, patch: { done: !t.done } })}
            onScheduleToday={() => update.mutate({ id: t.id, patch: { date: selectedDate, startAt: `${selectedDate}T09:00:00.000Z` } })}
            onDelete={() => del.mutate(t.id)}
          />
        ))}
        {!tasks.length && (
          <div className="text-center text-sm text-slate-500 py-10">
            No tasks here. Try: <span className="font-medium">"meet Alex tomorrow 14:00-15:00 @Work #sales !!"</span>
          </div>
        )}
      </div>
    </div>
  );
}

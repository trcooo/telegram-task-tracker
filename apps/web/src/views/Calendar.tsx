import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import type { List, Task } from "@pp/shared";
import { api } from "../lib/api";
import { useUI } from "../store/ui";

function colorFor(listId: string | null | undefined, lists: List[]) {
  const l = lists.find(x => x.id === listId);
  return l?.color || "#94a3b8";
}

export default function CalendarView({ lists }: { lists: List[] }) {
  const selectedDate = useUI((s) => s.selectedDate);
  const setSelectedDate = useUI((s) => s.setSelectedDate);
  const [month, setMonth] = useState(dayjs(selectedDate).startOf("month"));

  const tasksQ = useQuery({ queryKey: ["tasks", "all"], queryFn: () => api.tasks({ view: "all" }) });

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of (tasksQ.data || []) as Task[]) {
      const d = t.date || (t.startAt ? dayjs(t.startAt).format("YYYY-MM-DD") : null);
      if (!d) continue;
      map.set(d, [...(map.get(d) || []), t]);
    }
    return map;
  }, [tasksQ.data]);

  const days = useMemo(() => {
    const start = month.startOf("week");
    return Array.from({ length: 42 }, (_, i) => start.add(i, "day"));
  }, [month]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-3 flex items-center justify-between">
        <button onClick={() => setMonth(month.subtract(1, "month"))} className="w-10 h-10 rounded-2xl bg-slate-100">‹</button>
        <div className="text-sm font-semibold">{month.format("MMMM YYYY")}</div>
        <button onClick={() => setMonth(month.add(1, "month"))} className="w-10 h-10 rounded-2xl bg-slate-100">›</button>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="grid grid-cols-7 gap-2 text-[11px] text-slate-500 mb-2">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d} className="text-center">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const key = d.format("YYYY-MM-DD");
            const tasks = (byDate.get(key) || []).slice(0, 3);
            const inMonth = d.month() === month.month();
            const active = key === selectedDate;
            return (
              <button
                key={key}
                onClick={() => setSelectedDate(key)}
                className={`rounded-2xl p-2 border ${active ? "border-slate-900" : "border-slate-100"} ${inMonth ? "bg-slate-50" : "bg-slate-50/40"} text-left`}
              >
                <div className={`text-xs ${inMonth ? "text-slate-900" : "text-slate-400"} ${active ? "font-semibold" : ""}`}>{d.date()}</div>
                <div className="mt-1 space-y-1">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="h-2 rounded-full"
                      style={{ background: colorFor(t.listId, lists) }}
                      title={t.title}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="text-sm font-semibold mb-2">{dayjs(selectedDate).format("ddd, D MMM")}</div>
        <div className="space-y-2">
          {(byDate.get(selectedDate) || []).map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: colorFor(t.listId, lists) }} />
              <div className="text-sm truncate flex-1">{t.title}</div>
              <div className="text-xs text-slate-500">{t.time || (t.startAt ? dayjs(t.startAt).format("HH:mm") : "")}</div>
            </div>
          ))}
          {!(byDate.get(selectedDate)?.length) && <div className="text-sm text-slate-500">No tasks scheduled.</div>}
        </div>
      </div>
    </div>
  );
}

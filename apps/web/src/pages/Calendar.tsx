import { useMemo, useState } from "react";
import { addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, addDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, qs } from "../lib/api";
import type { TaskDto } from "../types/api";
import TaskCard from "../components/TaskCard";

function monthRange(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  return { start, end };
}

export default function Calendar() {
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());

  const { start, end } = useMemo(() => monthRange(month), [month]);

  const tasksQ = useQuery({
    queryKey: ["tasks", "calendar", format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd")],
    queryFn: () =>
      apiFetch<{ items: TaskDto[] }>(
        `/api/tasks${qs({ status: "TODO", from: start.toISOString(), to: end.toISOString() })}`
      ),
    staleTime: 20_000
  });

  const tasks = tasksQ.data?.items ?? [];

  const byDay = useMemo(() => {
    const map = new Map<string, TaskDto[]>();
    for (const t of tasks) {
      const keyDate = t.startAt ? new Date(t.startAt) : t.dueAt ? new Date(t.dueAt) : null;
      if (!keyDate) continue;
      const key = format(keyDate, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const gridDays = useMemo(() => {
    const days: Date[] = [];
    let d = start;
    while (d <= end) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [start, end]);

  const selectedKey = format(selected, "yyyy-MM-dd");
  const selectedTasks = byDay.get(selectedKey) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Calendar</div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setMonth((m) => addMonths(m, -1))}>
            ←
          </button>
          <div className="card px-3 py-2 text-sm font-medium">{format(month, "MMMM yyyy")}</div>
          <button className="btn btn-ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>
            →
          </button>
        </div>
      </div>

      <div className="mt-3 card p-3">
        <div className="grid grid-cols-7 gap-2 text-xs text-slate-500 px-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {gridDays.map((d) => {
            const inMonth = isSameMonth(d, month);
            const isSel = isSameDay(d, selected);
            const key = format(d, "yyyy-MM-dd");
            const count = byDay.get(key)?.length ?? 0;

            return (
              <button
                key={key}
                onClick={() => setSelected(d)}
                className={`rounded-2xl border p-2 text-left transition ${
                  isSel ? "bg-slate-900 text-white border-slate-900" : "bg-white/60 border-slate-200/70"
                } ${inMonth ? "" : "opacity-50"}`}
              >
                <div className="flex items-center justify-between">
                  <div className={`text-sm font-semibold ${isSel ? "text-white" : "text-slate-900"}`}>{format(d, "d")}</div>
                  {count > 0 && (
                    <div className={`text-[10px] px-2 py-1 rounded-full ${isSel ? "bg-white/15" : "bg-slate-900/10"}`}>{count}</div>
                  )}
                </div>
                {count > 0 && <div className={`mt-2 h-1.5 rounded-full ${isSel ? "bg-white/40" : "bg-slate-900/10"}`} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{format(selected, "EEE, dd MMM")}</div>
          <div className="text-xs text-slate-500">{selectedTasks.length} tasks</div>
        </div>

        <div className="mt-2 space-y-2">
          {selectedTasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
          {!tasksQ.isLoading && selectedTasks.length === 0 && <div className="card p-4 text-sm text-slate-500">На этот день задач нет.</div>}
        </div>
      </div>
    </div>
  );
}

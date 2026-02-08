import { useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, qs } from "../lib/api";
import type { TaskDto } from "../types/api";
import TaskCard from "../components/TaskCard";

const START_HOUR = 7;
const END_HOUR = 22;

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}
function minutesFromMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function Schedule() {
  const qc = useQueryClient();
  const [day, setDay] = useState<Date>(() => new Date());
  const dayStr = isoDay(day);

  const tasksQ = useQuery({
    queryKey: ["tasks", "schedule", dayStr],
    queryFn: () => apiFetch<{ items: TaskDto[] }>(`/api/tasks${qs({ status: "TODO", date: dayStr })}`),
    staleTime: 10_000
  });

  const updateM = useMutation({
    mutationFn: ({ id, startAt }: { id: string; startAt: string | null }) =>
      apiFetch<{ item: TaskDto }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ startAt }) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const tasks = tasksQ.data?.items ?? [];
  const scheduled = useMemo(() => tasks.filter((t) => t.startAt && t.status === "TODO"), [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.startAt && t.status === "TODO"), [tasks]);

  const gridMinutes = (END_HOUR - START_HOUR) * 60;
  const pxPerMinute = 600 / gridMinutes;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Schedule</div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setDay((d) => addDays(d, -1))}>
            ←
          </button>
          <div className="card px-3 py-2 text-sm font-medium">{format(day, "EEE, dd MMM")}</div>
          <button className="btn btn-ghost" onClick={() => setDay((d) => addDays(d, 1))}>
            →
          </button>
        </div>
      </div>

      <div className="mt-3 card p-3">
        <div className="text-sm font-semibold mb-2">Timeline</div>

        <div className="flex">
          <div className="time-col text-xs text-slate-500 pt-1">
            {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => {
              const h = START_HOUR + i;
              return (
                <div key={h} className="h-[40px] flex items-start">
                  {String(h).padStart(2, "0")}:00
                </div>
              );
            })}
          </div>

          <div className="flex-1 relative" style={{ height: 40 * (END_HOUR - START_HOUR + 1) }}>
            {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-slate-200/60" style={{ top: i * 40 }} />
            ))}

            {scheduled.map((t) => {
              const st = parseISO(t.startAt!);
              if (!isSameDay(st, day)) return null;

              const topMin = clamp(minutesFromMidnight(st) - START_HOUR * 60, 0, gridMinutes);
              const dur = clamp(t.durationMin ?? 45, 15, 240);
              const topPx = topMin * pxPerMinute + 8;
              const heightPx = dur * pxPerMinute;

              return (
                <div key={t.id} className="absolute left-2 right-2" style={{ top: topPx, height: Math.max(46, heightPx) }}>
                  <div className="h-full">
                    <TaskCard task={t} compact />
                    <div className="mt-2 flex gap-2">
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          const next = new Date(st);
                          next.setMinutes(next.getMinutes() - 15);
                          updateM.mutate({ id: t.id, startAt: next.toISOString() });
                        }}
                      >
                        -15m
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          const next = new Date(st);
                          next.setMinutes(next.getMinutes() + 15);
                          updateM.mutate({ id: t.id, startAt: next.toISOString() });
                        }}
                      >
                        +15m
                      </button>
                      <button className="btn btn-ghost" onClick={() => updateM.mutate({ id: t.id, startAt: null })}>
                        Unpin
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">Unscheduled</div>
          <div className="space-y-2">
            {unscheduled.map((t) => (
              <div key={t.id} className="card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.title}</div>
                    <div className="text-xs text-slate-600 mt-1">Прикрепи к времени</div>
                  </div>
                  <select
                    className="px-3 py-2 rounded-xl bg-white/70 border border-slate-200/70 text-sm"
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      const dt = startOfDay(day);
                      dt.setHours(h, 0, 0, 0);
                      updateM.mutate({ id: t.id, startAt: dt.toISOString() });
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Set time
                    </option>
                    {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => {
                      const h = START_HOUR + i;
                      return (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            ))}
            {unscheduled.length === 0 && <div className="text-sm text-slate-500">Все задачи уже на таймлайне 🎉</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

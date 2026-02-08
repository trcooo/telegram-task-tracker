import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { TaskDto } from "../types/api";
import { format } from "date-fns";
import { haptic } from "../lib/tg";

function colorClass(priority: number) {
  if (priority <= 1) return "task-color-4";
  if (priority === 2) return "task-color-3";
  if (priority === 3) return "task-color-2";
  return "task-color-1";
}

export default function TaskCard({ task, compact }: { task: TaskDto; compact?: boolean }) {
  const qc = useQueryClient();

  const updateM = useMutation({
    mutationFn: (patch: Partial<TaskDto>) =>
      apiFetch<{ item: TaskDto }>(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      await qc.invalidateQueries({ queryKey: ["reminders"] });
      haptic("success");
    }
  });

  const delM = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>(`/api/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      await qc.invalidateQueries({ queryKey: ["reminders"] });
      haptic("impact");
    }
  });

  const quickReminderM = useMutation({
    mutationFn: () => apiFetch(`/api/reminders/task/${task.id}/quick`, { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["reminders"] });
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      haptic("success");
    }
  });

  const due = task.dueAt ? format(new Date(task.dueAt), "dd MMM, HH:mm") : null;
  const start = task.startAt ? format(new Date(task.startAt), "HH:mm") : null;

  return (
    <div className={`card border px-3 py-3 ${colorClass(task.priority)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-semibold ${compact ? "text-sm" : "text-[15px]"} truncate`}>{task.title}</div>
          {!compact && task.description && (
            <div className="text-xs text-slate-600 mt-1 line-clamp-2">{task.description}</div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            {task.status === "DONE" ? (
              <span className="pill border-emerald-300/60 bg-emerald-100/60 text-emerald-900">Done</span>
            ) : (
              <span className="pill border-slate-200 bg-white/60 text-slate-700">Todo</span>
            )}
            {start && <span className="pill border-slate-200 bg-white/60 text-slate-700">Start {start}</span>}
            {due && <span className="pill border-slate-200 bg-white/60 text-slate-700">Due {due}</span>}
            {task.nextReminderAt && (
              <span className="pill border-slate-200 bg-white/60 text-slate-700">
                🔔 {format(new Date(task.nextReminderAt), "HH:mm")}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => updateM.mutate({ status: task.status === "DONE" ? "TODO" : "DONE" })}
            disabled={updateM.isPending}
          >
            {task.status === "DONE" ? "Undo" : "Done"}
          </button>

          <button
            className="btn btn-ghost"
            onClick={() => quickReminderM.mutate()}
            disabled={quickReminderM.isPending}
            title="Напомнить через 10 минут"
          >
            Snooze
          </button>

          <button className="btn btn-ghost" onClick={() => delM.mutate()} disabled={delM.isPending}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

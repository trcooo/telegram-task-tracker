import dayjs from "dayjs";
import type { List, Task } from "@pp/shared";

function pillClass(priority: number) {
  if (priority >= 3) return "bg-rose-100 text-rose-700";
  if (priority === 2) return "bg-orange-100 text-orange-700";
  if (priority === 1) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function TaskCard({
  task,
  lists,
  onToggleDone,
  onScheduleToday,
  onDelete
}: {
  task: Task;
  lists: List[];
  onToggleDone: () => void;
  onScheduleToday: () => void;
  onDelete: () => void;
}) {
  const list = lists.find((l) => l.id === task.listId);
  const when = task.startAt
    ? dayjs(task.startAt).format("DD.MM HH:mm")
    : task.date
      ? `${task.date}${task.time ? " " + task.time : ""}`
      : null;

  return (
    <div className="bg-white rounded-2xl shadow-soft p-3 flex gap-3">
      <button
        onClick={onToggleDone}
        className={`w-6 h-6 mt-0.5 rounded-full border flex items-center justify-center ${
          task.done ? "bg-slate-900 text-white border-slate-900" : "border-slate-300"
        }`}
        aria-label="Toggle done"
      >
        {task.done ? "✓" : ""}
      </button>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${task.done ? "line-through text-slate-400" : ""}`}>{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${pillClass(task.priority)}`}>P{task.priority}</span>
          {task.kind !== "task" ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{task.kind}</span>
          ) : null}
          {list?.title ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{list.title}</span>
          ) : null}
          {when ? <span className="text-[11px] text-slate-500">{when}</span> : <span className="text-[11px] text-slate-400">Unscheduled</span>}
          {(task.tags || []).slice(0, 3).map((t) => (
            <span key={t} className="text-[11px] text-slate-500">#{t}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button onClick={onScheduleToday} className="text-[11px] px-2 py-1 rounded-xl bg-slate-100">Today</button>
        <button onClick={onDelete} className="text-[11px] px-2 py-1 rounded-xl bg-slate-100">Del</button>
      </div>
    </div>
  );
}

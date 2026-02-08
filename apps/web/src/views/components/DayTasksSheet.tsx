import dayjs from "dayjs";
import type { Task, List } from "@pp/shared";

export default function DayTasksSheet({
  open,
  date,
  tasks,
  lists,
  onClose,
  onPick
}: {
  open: boolean;
  date: string;
  tasks: Task[];
  lists: List[];
  onClose: () => void;
  onPick?: (task: Task) => void;
}) {
  if (!open) return null;

  const title = dayjs(date).format("ddd, D MMM");

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-3 mb-3 bg-white rounded-3xl shadow-soft border border-slate-100 overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs text-slate-500">All tasks for this day</div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-slate-100">✕</button>
          </div>
          <div className="px-4 pb-4 space-y-2 max-h-[55vh] overflow-auto">
            {tasks.map((t) => {
              const list = lists.find((l) => l.id === t.listId);
              return (
                <button
                  key={t.id}
                  onClick={() => onPick?.(t)}
                  className="w-full text-left bg-slate-50 border border-slate-100 rounded-2xl p-3"
                >
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="mt-1 flex gap-2 items-center text-xs text-slate-500 flex-wrap">
                    {t.time ? <span>{t.time}</span> : null}
                    {list?.title ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px]">{list.title}</span> : null}
                    {(t.tags || []).slice(0, 3).map((x) => (
                      <span key={x} className="text-[11px]">#{x}</span>
                    ))}
                  </div>
                </button>
              );
            })}
            {!tasks.length ? <div className="text-sm text-slate-500">No tasks.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

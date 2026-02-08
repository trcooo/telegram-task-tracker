import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, qs } from "../lib/api";
import type { TaskDto } from "../types/api";
import TaskCard from "../components/TaskCard";
import TaskEditor from "../components/TaskEditor";
import { useMemo, useState } from "react";
import { format } from "date-fns";

type Filter = "Today" | "Upcoming" | "Done";

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export default function Inbox() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("Today");

  const today = useMemo(() => new Date(), []);
  const todayStr = isoDay(today);

  const queryParams = useMemo(() => {
    if (filter === "Done") return qs({ status: "DONE" });
    if (filter === "Upcoming") return qs({ status: "TODO" });
    return qs({ status: "TODO", date: todayStr });
  }, [filter, todayStr]);

  const tasksQ = useQuery({
    queryKey: ["tasks", "inbox", filter, todayStr],
    queryFn: () => apiFetch<{ items: TaskDto[] }>(`/api/tasks${queryParams}`)
  });

  const createM = useMutation({
    mutationFn: (payload: { title: string; description?: string }) =>
      apiFetch<{ item: TaskDto }>("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
    }
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Inbox</div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          + Add
        </button>
      </div>

      <div className="mt-3 card px-2 py-2 flex gap-2">
        {(["Today", "Upcoming", "Done"] as Filter[]).map((f) => (
          <button key={f} className={`btn flex-1 ${filter === f ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {(tasksQ.data?.items || []).map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
        {!tasksQ.isLoading && (tasksQ.data?.items?.length ?? 0) === 0 && (
          <div className="text-sm text-slate-500 mt-6">Пока пусто. Добавь задачу.</div>
        )}
      </div>

      {open && (
        <TaskEditor title="Новая задача" onClose={() => setOpen(false)} onSubmit={(v) => createM.mutate(v)} loading={createM.isPending} />
      )}
    </div>
  );
}

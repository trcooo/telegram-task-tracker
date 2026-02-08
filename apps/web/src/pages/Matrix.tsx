import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, qs } from "../lib/api";
import type { TaskDto, TaskQuadrant } from "../types/api";

const QUADS: { key: Exclude<TaskQuadrant, null>; title: string; hint: string }[] = [
  { key: "Q1_URGENT_IMPORTANT", title: "Urgent / Important", hint: "Сделать сейчас" },
  { key: "Q2_NOT_URGENT_IMPORTANT", title: "Not urgent / Important", hint: "Планировать" },
  { key: "Q3_URGENT_NOT_IMPORTANT", title: "Urgent / Not important", hint: "Делегировать" },
  { key: "Q4_NOT_URGENT_NOT_IMPORTANT", title: "Not urgent / Not important", hint: "Минимизировать" }
];

function quadColor(q: TaskQuadrant) {
  switch (q) {
    case "Q1_URGENT_IMPORTANT":
      return "task-color-4";
    case "Q2_NOT_URGENT_IMPORTANT":
      return "task-color-2";
    case "Q3_URGENT_NOT_IMPORTANT":
      return "task-color-3";
    case "Q4_NOT_URGENT_NOT_IMPORTANT":
      return "task-color-1";
    default:
      return "bg-white/60 border-slate-200/70";
  }
}

export default function Matrix() {
  const qc = useQueryClient();

  const tasksQ = useQuery({
    queryKey: ["tasks", "matrix"],
    queryFn: () => apiFetch<{ items: TaskDto[] }>(`/api/tasks${qs({ status: "TODO" })}`),
    staleTime: 10_000
  });

  const updateM = useMutation({
    mutationFn: ({ id, quadrant }: { id: string; quadrant: TaskQuadrant }) =>
      apiFetch<{ item: TaskDto }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ quadrant }) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const tasks = tasksQ.data?.items ?? [];

  const byQuad = useMemo(() => {
    const map = new Map<string, TaskDto[]>();
    for (const q of QUADS) map.set(q.key, []);
    for (const t of tasks) {
      const key = (t.quadrant ?? "Q2_NOT_URGENT_IMPORTANT") as string;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  function onDrop(q: Exclude<TaskQuadrant, null>, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/taskId");
    if (!id) return;
    updateM.mutate({ id, quadrant: q });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Priority Matrix</div>
        <div className="text-xs text-slate-500">Drag & drop</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {QUADS.map((q) => {
          const list = byQuad.get(q.key) ?? [];
          return (
            <div
              key={q.key}
              className="card p-3 min-h-[240px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(q.key, e)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">{q.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{q.hint}</div>
                </div>
                <div className="text-xs text-slate-500">{list.length}</div>
              </div>

              <div className="mt-3 space-y-2">
                {list.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/taskId", t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={`rounded-2xl border px-3 py-3 cursor-grab active:cursor-grabbing ${quadColor(q.key)}`}
                  >
                    <div className="font-semibold text-sm truncate">{t.title}</div>
                    {t.description && <div className="text-xs text-slate-600 mt-1 line-clamp-2">{t.description}</div>}
                    <div className="mt-2 flex gap-2">
                      <span className="pill border-slate-200 bg-white/60 text-slate-700">P{t.priority}</span>
                      {t.startAt && <span className="pill border-slate-200 bg-white/60 text-slate-700">🕒</span>}
                      {t.dueAt && <span className="pill border-slate-200 bg-white/60 text-slate-700">📅</span>}
                    </div>
                  </div>
                ))}

                {list.length === 0 && <div className="text-sm text-slate-500">Перетащи сюда задачи</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 card p-3 text-xs text-slate-600">
        Если у задачи нет квадранта — она считается “Not urgent / Important”.
      </div>
    </div>
  );
}

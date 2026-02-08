import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { List, Task } from "@pp/shared";
import { api } from "../lib/api";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";

function Quadrant({ id, title, hint, children }: { id: string; title: string; hint: string; children: any }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`bg-white rounded-2xl shadow-soft p-3 border ${isOver ? "border-slate-900" : "border-slate-100"} min-h-[180px]`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-slate-500 mb-2">{hint}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DraggableMini({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style: any = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-2xl p-2 bg-slate-50 border border-slate-100 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <div className="text-sm truncate">{task.title}</div>
      <div className="text-[11px] text-slate-500">P{task.priority}</div>
    </div>
  );
}

export default function Matrix({ lists }: { lists: List[] }) {
  const qc = useQueryClient();
  const tasksQ = useQuery({ queryKey: ["tasks", "all"], queryFn: () => api.tasks({ view: "all" }) });

  const tasks = useMemo(() => ((tasksQ.data || []) as Task[]).filter((t) => !t.done), [tasksQ.data]);

  const byQ = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const q = t.matrixQuadrant || "INBOX";
      map.set(q, [...(map.get(q) || []), t]);
    }
    return map;
  }, [tasks]);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api.updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] })
  });

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    update.mutate({ id: taskId, patch: { matrixQuadrant: over } });
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="text-sm font-semibold">Eisenhower Matrix</div>
        <div className="text-xs text-slate-500">Drag tasks between quadrants. Keep Q1 small, grow Q2.</div>
      </div>

      <DndContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-2 gap-3">
          <Quadrant id="Q1" title="Urgent + Important" hint="Do now">
            {(byQ.get("Q1") || []).map((t) => <DraggableMini key={t.id} task={t} />)}
          </Quadrant>
          <Quadrant id="Q2" title="Not urgent + Important" hint="Plan & focus">
            {(byQ.get("Q2") || []).map((t) => <DraggableMini key={t.id} task={t} />)}
          </Quadrant>
          <Quadrant id="Q3" title="Urgent + Not important" hint="Delegate / minimize">
            {(byQ.get("Q3") || []).map((t) => <DraggableMini key={t.id} task={t} />)}
          </Quadrant>
          <Quadrant id="Q4" title="Not urgent + Not important" hint="Drop / later">
            {(byQ.get("Q4") || []).map((t) => <DraggableMini key={t.id} task={t} />)}
          </Quadrant>
        </div>

        <div className="mt-3">
          <Quadrant id="INBOX" title="Inbox" hint="Unsorted tasks (drag into a quadrant)">
            {(byQ.get("INBOX") || []).slice(0, 8).map((t) => <DraggableMini key={t.id} task={t} />)}
          </Quadrant>
        </div>
      </DndContext>
    </div>
  );
}

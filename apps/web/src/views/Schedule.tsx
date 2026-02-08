import { useMemo } from "react";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { List, Task } from "@pp/shared";
import { api } from "../lib/api";
import { useUI } from "../store/ui";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";

function Slot({ id, label, children }: { id: string; label: string; children?: any }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`relative rounded-2xl border ${isOver ? "border-slate-900" : "border-slate-100"} bg-white shadow-soft p-3 min-h-[64px]`}>
      <div className="absolute top-2 left-3 text-[11px] text-slate-400">{label}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DraggableTask({ task, lists }: { task: Task; lists: List[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style: any = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const list = lists.find((l) => l.id === task.listId);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-2xl p-3 border border-slate-100 bg-slate-50 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <div className="text-sm font-medium truncate">{task.title}</div>
      <div className="mt-1 flex gap-2 items-center flex-wrap">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">P{task.priority}</span>
        {list?.title ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{list.title}</span>
        ) : null}
        {task.kind !== "task" ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{task.kind}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function Schedule({ lists }: { lists: List[] }) {
  const qc = useQueryClient();
  const selectedDate = useUI((s) => s.selectedDate);
  const setSelectedDate = useUI((s) => s.setSelectedDate);

  const tasksQ = useQuery({
    queryKey: ["tasks", "date", selectedDate],
    queryFn: () => api.tasks({ view: "date", date: selectedDate })
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api.updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] })
  });

  const slots = useMemo(() => {
    const start = dayjs(`${selectedDate}T06:00:00`);
    return Array.from({ length: 32 }, (_, i) => start.add(i * 30, "minute"));
  }, [selectedDate]);

  const slotMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of (tasksQ.data || []) as Task[]) {
      const startAt = t.startAt ? dayjs(t.startAt) : (t.time ? dayjs(`${selectedDate}T${t.time}:00`) : null);
      if (!startAt) continue;
      // nearest slot
      let idx = Math.round((startAt.diff(dayjs(`${selectedDate}T06:00:00`), "minute")) / 30);
      idx = Math.max(0, Math.min(31, idx));
      const key = `slot-${idx}`;
      map.set(key, [...(map.get(key) || []), t]);
    }
    return map;
  }, [tasksQ.data, selectedDate]);

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over || !over.startsWith("slot-")) return;
    const idx = Number(over.replace("slot-", ""));
    const start = slots[idx];
    update.mutate({ id: taskId, patch: { date: selectedDate, startAt: start.toISOString(), time: start.format("HH:mm") } });
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-3 flex items-center justify-between">
        <button onClick={() => setSelectedDate(dayjs(selectedDate).subtract(1, "day").format("YYYY-MM-DD"))} className="w-10 h-10 rounded-2xl bg-slate-100">‹</button>
        <div className="text-sm font-semibold">{dayjs(selectedDate).format("dddd, D MMM")}</div>
        <button onClick={() => setSelectedDate(dayjs(selectedDate).add(1, "day").format("YYYY-MM-DD"))} className="w-10 h-10 rounded-2xl bg-slate-100">›</button>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="text-sm font-semibold mb-1">Day timeline</div>
        <div className="text-xs text-slate-500">Drag tasks to reschedule. Tip: create from Inbox with time like “14:00-15:00”.</div>
      </div>

      <DndContext onDragEnd={onDragEnd}>
        <div className="space-y-2">
          {slots.map((t, idx) => (
            <Slot key={idx} id={`slot-${idx}`} label={t.format("HH:mm")}>
              <div className="space-y-2">
                {(slotMap.get(`slot-${idx}`) || []).map((task) => (
                  <DraggableTask key={task.id} task={task} lists={lists} />
                ))}
              </div>
            </Slot>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

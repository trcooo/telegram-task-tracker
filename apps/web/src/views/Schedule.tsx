import { useMemo, useState } from "react";
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

function DraggableTask({
  task,
  lists,
  minutes,
  onResize
}: {
  task: Task;
  lists: List[];
  minutes: number;
  onResize: (minutes: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const style: any = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const list = lists.find((l) => l.id === task.listId);
  const [resizing, setResizing] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState<number>(minutes);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-2xl p-3 border border-slate-100 bg-slate-50 cursor-grab active:cursor-grabbing relative ${
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

      {/* resize handle */}
      <div className="mt-2 flex items-center justify-between">
        <div className="text-[11px] text-slate-500">{(resizing ? draftMinutes : minutes)} min</div>
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as any).setPointerCapture?.(e.pointerId);
            setResizing(true);
            setDraftMinutes(minutes);
            (e.currentTarget as any)._sy = e.clientY;
          }}
          onPointerMove={(e) => {
            if (!resizing) return;
            const sy = (e.currentTarget as any)._sy ?? e.clientY;
            const dy = e.clientY - sy;
            // 1 slot (~30px) -> 15 minutes approx
            const delta = Math.round(dy / 18) * 15;
            const next = Math.max(15, Math.min(240, minutes + delta));
            setDraftMinutes(next);
          }}
          onPointerUp={() => {
            if (!resizing) return;
            setResizing(false);
            onResize(draftMinutes);
          }}
          className={`w-16 h-6 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-[11px] text-slate-600 ${
            resizing ? "ring-2 ring-slate-200" : ""
          }`}
        >
          ↕ Resize
        </div>
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

  // Unscheduled pool (inbox-like) for quick drop into timeline
  const poolQ = useQuery({
    queryKey: ["tasks", "pool"],
    queryFn: () => api.tasks({ view: "inbox" })
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

  const unscheduled = useMemo(() => {
    const fromDate = ((tasksQ.data || []) as Task[]).filter((t) => !t.startAt && !t.time);
    const inbox = ((poolQ.data || []) as Task[]).filter((t) => !t.startAt && !t.time && !t.date);
    // de-dup by id
    const map = new Map<string, Task>();
    for (const t of [...fromDate, ...inbox]) map.set(t.id, t);
    return Array.from(map.values()).slice(0, 12);
  }, [tasksQ.data, poolQ.data]);

  // local duration overrides for unscheduled tasks (until they get a startAt)
  const [draftDurations, setDraftDurations] = useState<Record<string, number>>({});

  function getMinutes(t: Task): number {
    if (t.startAt && t.endAt) {
      const m = dayjs(t.endAt).diff(dayjs(t.startAt), "minute");
      if (m > 0) return m;
    }
    return draftDurations[t.id] || 30;
  }

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over || !over.startsWith("slot-")) return;
    const idx = Number(over.replace("slot-", ""));
    const start = slots[idx];
    // set endAt using existing duration (or default)
    const t = [...((tasksQ.data || []) as Task[]), ...((poolQ.data || []) as Task[])].find((x) => x.id === taskId);
    const mins = t ? getMinutes(t) : 30;
    const end = start.add(mins, "minute");
    update.mutate({ id: taskId, patch: { date: selectedDate, startAt: start.toISOString(), endAt: end.toISOString(), time: start.format("HH:mm") } });
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
        <div className="text-xs text-slate-500">Drag tasks to reschedule. Resize duration. Drop unscheduled tasks into a time slot.</div>
      </div>

      {unscheduled.length ? (
        <div className="bg-white rounded-2xl shadow-soft p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Unscheduled</div>
              <div className="text-xs text-slate-500">Drag into the timeline</div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {unscheduled.map((t) => (
              <DraggableTask
                key={t.id}
                task={t}
                lists={lists}
                minutes={getMinutes(t)}
                onResize={(mins) => setDraftDurations((prev) => ({ ...prev, [t.id]: mins }))}
              />
            ))}
          </div>
        </div>
      ) : null}

      <DndContext onDragEnd={onDragEnd}>
        <div className="space-y-2">
          {slots.map((t, idx) => (
            <Slot key={idx} id={`slot-${idx}`} label={t.format("HH:mm")}>
              <div className="space-y-2">
                {(slotMap.get(`slot-${idx}`) || []).map((task) => (
                  <DraggableTask
                    key={task.id}
                    task={task}
                    lists={lists}
                    minutes={getMinutes(task)}
                    onResize={(mins) => {
                      if (!task.startAt) return;
                      const start = dayjs(task.startAt);
                      const end = start.add(mins, "minute");
                      update.mutate({
                        id: task.id,
                        patch: {
                          endAt: end.toISOString()
                        }
                      });
                    }}
                  />
                ))}
              </div>
            </Slot>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

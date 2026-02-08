import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import type { List, Task } from "@pp/shared";
import { api } from "../lib/api";
import { useUI } from "../store/ui";
import DayTasksSheet from "./components/DayTasksSheet";

function colorFor(listId: string | null | undefined, lists: List[]) {
  const l = lists.find((x) => x.id === listId);
  return l?.color || "#94a3b8";
}

function TaskPill({ task, lists, onActive }: { task: Task; lists: List[]; onActive: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `task-${task.id}` });
  const dragStyle: any = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const c = colorFor(task.listId, lists);
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={onActive}
      className={`w-full text-left px-2 py-1 rounded-xl text-[11px] border truncate cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-60" : "opacity-100"
      }`}
      title={task.title}
      // light pill with subtle tint
      style={{ ...dragStyle, background: `${c}1A`, borderColor: `${c}33`, color: "#0f172a" }}
    >
      {task.title}
    </button>
  );
}

function DayCell({
  date,
  inMonth,
  active,
  tasks,
  lists,
  onSelect,
  onActiveTask,
  onMore
}: {
  date: string;
  inMonth: boolean;
  active: boolean;
  tasks: Task[];
  lists: List[];
  onSelect: () => void;
  onActiveTask: (t: Task) => void;
  onMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}` });
  const d = dayjs(date);
  const pills = tasks.slice(0, 2);
  const more = tasks.length - pills.length;
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl p-2 border ${active ? "border-slate-900" : "border-slate-100"} ${
        inMonth ? "bg-slate-50" : "bg-slate-50/40"
      } ${isOver ? "ring-2 ring-slate-300" : ""}`}
    >
      <button onClick={onSelect} className="w-full text-left">
        <div className={`text-xs ${inMonth ? "text-slate-900" : "text-slate-400"} ${active ? "font-semibold" : ""}`}>{d.date()}</div>
      </button>
      <div className="mt-1 space-y-1">
        {pills.map((t) => (
          <TaskPill key={t.id} task={t} lists={lists} onActive={() => onActiveTask(t)} />
        ))}
        {more > 0 ? (
          <button onClick={onMore} className="text-[11px] text-slate-500 pl-1 underline decoration-slate-200">+{more} more</button>
        ) : null}
      </div>
    </div>
  );
}

export default function CalendarView({ lists }: { lists: List[] }) {
  const qc = useQueryClient();
  const selectedDate = useUI((s) => s.selectedDate);
  const setSelectedDate = useUI((s) => s.setSelectedDate);
  const setTab = useUI((s) => s.setTab);
  const [month, setMonth] = useState(dayjs(selectedDate).startOf("month"));
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [sheetDate, setSheetDate] = useState<string | null>(null);

  const scheduleDrop = useDroppable({ id: "schedule-drop" });

  const tasksQ = useQuery({ queryKey: ["tasks", "all"], queryFn: () => api.tasks({ view: "all" }) });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api.updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] })
  });

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of (tasksQ.data || []) as Task[]) {
      const d = t.date || (t.startAt ? dayjs(t.startAt).format("YYYY-MM-DD") : null);
      if (!d) continue;
      map.set(d, [...(map.get(d) || []), t]);
    }
    // Stable order: time first, then priority
    for (const [k, arr] of map) {
      arr.sort((a, b) => {
        const ta = a.startAt ? dayjs(a.startAt).valueOf() : a.time ? dayjs(`${k}T${a.time}:00`).valueOf() : 0;
        const tb = b.startAt ? dayjs(b.startAt).valueOf() : b.time ? dayjs(`${k}T${b.time}:00`).valueOf() : 0;
        if (ta !== tb) return ta - tb;
        return (b.priority || 0) - (a.priority || 0);
      });
    }
    return map;
  }, [tasksQ.data]);

  const days = useMemo(() => {
    const start = month.startOf("week");
    return Array.from({ length: 42 }, (_, i) => start.add(i, "day"));
  }, [month]);

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id).replace("task-", "");
    const overId = e.over?.id ? String(e.over.id) : null;
    setActiveTask(null);
    if (!overId) return;

    const t = ((tasksQ.data || []) as Task[]).find((x) => x.id === taskId);
    if (!t) return;

    // Fast drag from Calendar -> Schedule: drop into the "Day plan" area.
    if (overId === "schedule-drop") {
      // Put the task onto the currently selected date and jump to Schedule.
      const date = selectedDate;
      const next = dayjs(`${date}T09:00:00`);
      update.mutate({ id: taskId, patch: { date, startAt: next.toISOString(), time: next.format("HH:mm") } });
      setTab("schedule");
      return;
    }

    if (!overId.startsWith("day-")) return;
    const date = overId.replace("day-", "");

    if (t.startAt) {
      const start = dayjs(t.startAt);
      const next = dayjs(date).hour(start.hour()).minute(start.minute()).second(0);
      update.mutate({ id: taskId, patch: { date, startAt: next.toISOString(), time: next.format("HH:mm") } });
    } else if (t.time) {
      const next = dayjs(`${date}T${t.time}:00`);
      update.mutate({ id: taskId, patch: { date, startAt: next.toISOString() } });
    } else {
      update.mutate({ id: taskId, patch: { date } });
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-3 flex items-center justify-between">
        <button onClick={() => setMonth(month.subtract(1, "month"))} className="w-10 h-10 rounded-2xl bg-slate-100">‹</button>
        <div className="text-sm font-semibold">{month.format("MMMM YYYY")}</div>
        <button onClick={() => setMonth(month.add(1, "month"))} className="w-10 h-10 rounded-2xl bg-slate-100">›</button>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="grid grid-cols-7 gap-2 text-[11px] text-slate-500 mb-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        <DndContext
          onDragStart={(e) => {
            const id = String(e.active.id).replace("task-", "");
            const t = ((tasksQ.data || []) as Task[]).find((x) => x.id === id);
            setActiveTask(t || null);
          }}
          onDragEnd={onDragEnd}
        >
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => {
              const date = d.format("YYYY-MM-DD");
              return (
                <DayCell
                  key={date}
                  date={date}
                  inMonth={d.month() === month.month()}
                  active={date === selectedDate}
                  tasks={(byDate.get(date) || []) as Task[]}
                  lists={lists}
                  onSelect={() => setSelectedDate(date)}
                  onActiveTask={(t) => setActiveTask(t)}
                  onMore={() => setSheetDate(date)}
                />
              );
            })}
          </div>

          {/* Drag from Calendar -> Schedule */}
          <div
            ref={scheduleDrop.setNodeRef}
            className={`mt-3 rounded-2xl border border-dashed px-3 py-3 text-sm flex items-center justify-between ${
              activeTask ? "bg-slate-50" : "bg-white"
            } ${scheduleDrop.isOver ? "ring-2 ring-slate-300" : ""}`}
          >
            <div>
              <div className="font-semibold">Day plan</div>
              <div className="text-xs text-slate-500">Drag a task here to schedule it at 09:00</div>
            </div>
            <div className="text-xs px-3 py-2 rounded-2xl bg-slate-100">Drop</div>
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="px-3 py-2 rounded-2xl bg-white shadow-soft border border-slate-100 text-sm">
                {activeTask.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <DayTasksSheet
        open={!!sheetDate}
        date={sheetDate || selectedDate}
        tasks={((sheetDate ? byDate.get(sheetDate) : byDate.get(selectedDate)) || []) as Task[]}
        lists={lists}
        onClose={() => setSheetDate(null)}
        onPick={(t) => {
          // quick jump to schedule when picking a task
          setSelectedDate(sheetDate || selectedDate);
          setTab("schedule");
        }}
      />

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="text-sm font-semibold mb-2">{dayjs(selectedDate).format("ddd, D MMM")}</div>
        <div className="space-y-2">
          {(byDate.get(selectedDate) || []).map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: colorFor(t.listId, lists) }} />
              <div className="text-sm truncate flex-1">{t.title}</div>
              <div className="text-xs text-slate-500">{t.time || (t.startAt ? dayjs(t.startAt).format("HH:mm") : "")}</div>
            </div>
          ))}
          {!(byDate.get(selectedDate)?.length) && <div className="text-sm text-slate-500">No tasks scheduled.</div>}
        </div>
      </div>
    </div>
  );
}

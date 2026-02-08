import { useRef, useState } from "react";
import dayjs from "dayjs";
import type { List, Task } from "@pp/shared";
import { hapticImpact } from "../../lib/telegram";

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
  onSchedule,
  onDelete
}: {
  task: Task;
  lists: List[];
  onToggleDone: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}) {
  const list = lists.find((l) => l.id === task.listId);
  const when = task.startAt
    ? dayjs(task.startAt).format("DD.MM HH:mm")
    : task.date
      ? `${task.date}${task.time ? " " + task.time : ""}`
      : null;

  // Swipe UX: right = done, left = schedule / delete
  // left threshold1 => schedule, threshold2 => delete
  const SWIPE_T1 = 80;
  const SWIPE_T2 = 150;
  const [dx, setDx] = useState(0);
  const [spring, setSpring] = useState(false);
  const lastHaptic = useRef<string>("");

  return (
    <div className="relative rounded-2xl shadow-soft overflow-hidden">
      {/* Background actions */}
      <div className="absolute inset-0 flex">
        <div className="flex-1 bg-emerald-500/90 flex items-center pl-4 text-white text-sm font-semibold">Done</div>
        <div className="flex-1 bg-sky-500/90 flex items-center justify-end pr-4 text-white text-sm font-semibold">Schedule</div>
        <div className="w-[72px] bg-rose-500/90 flex items-center justify-center text-white text-sm font-semibold">Delete</div>
      </div>

      {/* Foreground card */}
      <div
        className="bg-white rounded-2xl p-3 flex gap-3 relative"
        style={{
          transform: `translateX(${dx}px)`,
          transition: spring ? "transform 320ms cubic-bezier(0.2, 1.2, 0.2, 1)" : "none"
        }}
        onPointerDown={(e) => {
          (e.currentTarget as any).setPointerCapture?.(e.pointerId);
          (e.currentTarget as any)._swipeStart = { x: e.clientX, dx };
          setSpring(false);
          lastHaptic.current = "";
        }}
        onPointerMove={(e) => {
          const st = (e.currentTarget as any)._swipeStart;
          if (!st) return;
          const raw = st.dx + (e.clientX - st.x);
          // rubber band (feels more native)
          const clamped = raw < -220 ? -220 + (raw + 220) * 0.2 : raw > 140 ? 140 + (raw - 140) * 0.2 : raw;
          setDx(clamped);

          // Haptic on threshold cross
          const key = clamped > SWIPE_T1 ? "done" : clamped < -SWIPE_T2 ? "delete" : clamped < -SWIPE_T1 ? "schedule" : "";
          if (key && lastHaptic.current !== key) {
            hapticImpact(key === "delete" ? "heavy" : "light");
            lastHaptic.current = key;
          }
        }}
        onPointerUp={(e) => {
          const finalDx = dx;
          (e.currentTarget as any)._swipeStart = null;
          setSpring(true);
          // action resolution
          if (finalDx > SWIPE_T1) {
            setDx(0);
            hapticImpact("medium");
            onToggleDone();
            return;
          }
          if (finalDx < -SWIPE_T2) {
            setDx(0);
            hapticImpact("heavy");
            onDelete();
            return;
          }
          if (finalDx < -SWIPE_T1) {
            setDx(0);
            hapticImpact("medium");
            onSchedule();
            return;
          }
          setDx(0);
        }}
        onPointerCancel={() => setDx(0)}
      >
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

      </div>
    </div>
  );
}

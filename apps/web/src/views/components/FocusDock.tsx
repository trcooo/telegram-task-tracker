import { useEffect, useMemo } from "react";
import dayjs from "dayjs";
import type { Task } from "@pp/shared";
import { useUI } from "../../store/ui";

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export default function FocusDock({ tasks }: { tasks: Task[] }) {
  const focusTaskId = useUI((s) => s.focusTaskId);
  const pomodoroMode = useUI((s) => s.pomodoroMode);
  const pomodoroRunning = useUI((s) => s.pomodoroRunning);
  const pomodoroEndsAt = useUI((s) => s.pomodoroEndsAt);
  const startPomodoro = useUI((s) => s.startPomodoro);
  const startBreak = useUI((s) => s.startBreak);
  const stopFocus = useUI((s) => s.stopFocus);
  const tick = useUI((s) => s.tick);

  useEffect(() => {
    const id = setInterval(() => tick(), 500);
    return () => clearInterval(id);
  }, [tick]);

  const task = useMemo(() => tasks.find((t) => t.id === focusTaskId) || null, [tasks, focusTaskId]);
  if (!task) return null;

  const remaining = pomodoroEndsAt ? pomodoroEndsAt - Date.now() : 0;
  const timeText = pomodoroRunning ? formatMs(remaining) : pomodoroEndsAt ? "00:00" : "--:--";

  return (
    <div className="fixed bottom-20 left-0 right-0 px-4 z-50">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-soft border border-slate-100 p-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-slate-500">{pomodoroMode === "focus" ? "Focus" : "Break"} · {dayjs().format("HH:mm")}</div>
          <div className="text-sm font-semibold truncate">{task.title}</div>
        </div>

        <div className="text-lg font-semibold tabular-nums">{timeText}</div>

        <div className="flex gap-2">
          {!pomodoroRunning ? (
            pomodoroMode === "focus" ? (
              <button onClick={() => startPomodoro(25)} className="px-3 py-2 rounded-2xl bg-slate-900 text-white text-xs font-medium">Start 25</button>
            ) : (
              <button onClick={() => startBreak(5)} className="px-3 py-2 rounded-2xl bg-slate-900 text-white text-xs font-medium">Start 5</button>
            )
          ) : (
            <button onClick={stopFocus} className="px-3 py-2 rounded-2xl bg-slate-100 text-xs font-medium">Stop</button>
          )}

          {!pomodoroRunning ? (
            pomodoroMode === "focus" ? (
              <button onClick={() => startBreak(5)} className="px-3 py-2 rounded-2xl bg-slate-100 text-xs font-medium">Break</button>
            ) : (
              <button onClick={() => startPomodoro(25)} className="px-3 py-2 rounded-2xl bg-slate-100 text-xs font-medium">Focus</button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

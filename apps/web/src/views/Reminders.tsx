import { useState } from "react";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

function Tab({ id, active, onClick, label }: any) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex-1 py-2 rounded-xl text-sm font-medium ${active ? "bg-white shadow-soft" : "text-slate-500"}`}
    >
      {label}
    </button>
  );
}

export default function ReminderCenter() {
  const [mode, setMode] = useState<"upcoming"|"snoozed"|"sent">("upcoming");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["reminders", mode], queryFn: () => api.reminders(mode) });

  const snooze = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) => api.snooze(id, minutes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] })
  });

  return (
    <div className="space-y-3">
      <div className="bg-slate-100/80 backdrop-blur rounded-2xl p-2 shadow-soft flex gap-2">
        <Tab id="upcoming" label="Upcoming" active={mode==="upcoming"} onClick={setMode} />
        <Tab id="snoozed" label="Snoozed" active={mode==="snoozed"} onClick={setMode} />
        <Tab id="sent" label="Sent" active={mode==="sent"} onClick={setMode} />
      </div>

      <div className="space-y-2">
        {(q.data || []).map((r: any) => (
          <div key={r.id} className="bg-white rounded-2xl shadow-soft p-3 flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center">⏰</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.task?.title}</div>
              <div className="text-xs text-slate-500">{dayjs(r.at).format("DD.MM.YYYY HH:mm")} • {r.status}</div>
            </div>
            {mode !== "sent" ? (
              <div className="flex flex-col gap-2">
                <button onClick={() => snooze.mutate({ id: r.id, minutes: 10 })} className="text-[11px] px-2 py-1 rounded-xl bg-slate-100">+10m</button>
                <button onClick={() => snooze.mutate({ id: r.id, minutes: 60 })} className="text-[11px] px-2 py-1 rounded-xl bg-slate-100">+1h</button>
              </div>
            ) : null}
          </div>
        ))}
        {!q.data?.length && <div className="text-sm text-slate-500 text-center py-10">No items.</div>}
      </div>
    </div>
  );
}

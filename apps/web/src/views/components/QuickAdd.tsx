import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useMutation } from "@tanstack/react-query";
import type { List } from "@pp/shared";
import { api } from "../../lib/api";
import { useUI } from "../../store/ui";

function Chip({ label }: { label: string }) {
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{label}</span>;
}

export default function QuickAdd({ lists, onCreated }: { lists: List[]; onCreated: () => void; }) {
  const selectedDate = useUI((s) => s.selectedDate);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<any>(null);

  const parseM = useMutation({
    mutationFn: (t: string) => api.parse(t),
    onSuccess: (data) => setParsed(data)
  });

  const createM = useMutation({
    mutationFn: (payload: any) => api.createTask(payload),
    onSuccess: () => {
      setText("");
      setParsed(null);
      onCreated();
    }
  });

  const chips = useMemo(() => {
    if (!parsed) return [];
    const arr: string[] = [];
    if (parsed.date) arr.push(parsed.date);
    if (parsed.time) arr.push(parsed.time);
    if (parsed.startAt && parsed.endAt) arr.push("range");
    if (parsed.listHint) arr.push("@" + parsed.listHint);
    if (parsed.tags?.length) arr.push("#" + parsed.tags.join(" #"));
    if (parsed.priority) arr.push("P" + parsed.priority);
    if (parsed.kind && parsed.kind !== "task") arr.push(parsed.kind);
    if (parsed.focusFlag) arr.push("Focus");
    return arr;
  }, [parsed]);

  return (
    <div className="bg-white rounded-2xl shadow-soft p-3">
      <div className="text-sm font-semibold mb-2">Quick capture</div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (v.trim().length >= 3) parseM.mutate(v);
            else setParsed(null);
          }}
          placeholder='Type: "Study math tomorrow 19:00-20:30 #uni @Study !!!"'
          className="flex-1 px-3 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <button
          onClick={() => {
            const payload = parsed ? parsed : { title: text };
            // if nothing parsed, default to inbox; if only time parsed without date, attach selectedDate
            if (!payload.date && payload.time) payload.date = selectedDate;
            if (!payload.startAt && payload.time) payload.startAt = dayjs(`${payload.date} ${payload.time}`).toISOString();
            createM.mutate(payload);
          }}
          disabled={!text.trim() || createM.isPending}
          className="px-4 rounded-2xl bg-slate-900 text-white font-medium disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {parsed ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((c) => <Chip key={c} label={c} />)}
          <span className="text-[11px] text-slate-400">Auto-parsed</span>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-slate-500">
          Shortcuts: <span className="font-medium">!!!</span> priority, <span className="font-medium">@Work</span> list, <span className="font-medium">#tag</span>, <span className="font-medium">14:00-15:00</span>.
        </div>
      )}
    </div>
  );
}

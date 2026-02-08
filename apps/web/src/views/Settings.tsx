import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function Settings() {
  const qc = useQueryClient();
  const listsQ = useQuery({ queryKey: ["lists"], queryFn: api.lists });
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");

  const create = useMutation({
    mutationFn: () => api.createList({ title, folder: folder || null }),
    onSuccess: () => {
      setTitle("");
      setFolder("");
      qc.invalidateQueries({ queryKey: ["lists"] });
    }
  });

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="text-sm font-semibold">Lists & folders</div>
        <div className="text-xs text-slate-500">Organize like TickTick: folders group lists.</div>

        <div className="mt-3 flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="List name" className="flex-1 px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200" />
          <button onClick={() => create.mutate()} disabled={!title.trim()} className="px-4 rounded-2xl bg-slate-900 text-white disabled:opacity-40">Add</button>
        </div>
        <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Folder (optional)" className="mt-2 w-full px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200" />

        <div className="mt-3 space-y-2">
          {(listsQ.data || []).map((l) => (
            <div key={l.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{l.title}</div>
                <div className="text-xs text-slate-500 truncate">{l.folder ? `Folder: ${l.folder}` : "No folder"}</div>
              </div>
              <div className="w-3 h-3 rounded-full" style={{ background: l.color || "#94a3b8" }} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="text-sm font-semibold">Notifications</div>
        <div className="text-xs text-slate-500">
          For bot reminders, Railway needs a separate <span className="font-medium">worker</span> service running BullMQ.
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-soft p-3">
        <div className="text-sm font-semibold">Focus mode (Pomodoro)</div>
        <div className="text-xs text-slate-500">
          Coming next: timer, focus sessions, soft stats.
        </div>
      </div>
    </div>
  );
}

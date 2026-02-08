import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { List, Task } from "@pp/shared";
import { api } from "../lib/api";
import { useFilters } from "../store/filters";
import { useUI } from "../store/ui";

function SectionTitle({ children }: { children: any }) {
  return <div className="text-xs font-semibold text-slate-500 px-3 mt-4 mb-2">{children}</div>;
}

function Item({ active, label, onClick, pill }: { active?: boolean; label: string; onClick: () => void; pill?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm ${
        active ? "bg-white shadow-soft" : "hover:bg-white/60"
      }`}
    >
      <span className="truncate">{label}</span>
      {pill ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{pill}</span> : null}
    </button>
  );
}

export default function SideMenu({ open, onClose, lists }: { open: boolean; onClose: () => void; lists: List[] }) {
  const setTab = useUI((s) => s.setTab);
  const filters = useFilters();
  const tasksQ = useQuery({ queryKey: ["tasks", "all"], queryFn: () => api.tasks({ view: "all" }), enabled: open });

  const tags = useMemo(() => {
    const t = (tasksQ.data || []) as Task[];
    const map = new Map<string, number>();
    for (const task of t) {
      (task.tags || []).forEach((x) => map.set(x, (map.get(x) || 0) + 1));
    }
    return Array.from(map.entries()).sort((a,b) => b[1]-a[1]).slice(0, 12);
  }, [tasksQ.data]);

  const folders = useMemo(() => {
    const grouped = new Map<string, List[]>();
    for (const l of lists) {
      const key = l.folder || "Lists";
      grouped.set(key, [...(grouped.get(key) || []), l]);
    }
    return Array.from(grouped.entries());
  }, [lists]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute left-0 top-0 bottom-0 w-[86%] max-w-sm bg-slate-50 rounded-r-3xl shadow-soft p-3 overflow-y-auto">
        <div className="flex items-center justify-between p-2">
          <div className="font-semibold">Planner Menu</div>
          <button onClick={onClose} className="w-9 h-9 rounded-2xl bg-white shadow-soft">✕</button>
        </div>

        <SectionTitle>Smart Lists</SectionTitle>
        <div className="space-y-1">
          <Item active={filters.smart==="inbox"} label="Inbox" onClick={() => { filters.setSmart("inbox"); setTab("inbox"); onClose(); }} />
          <Item active={filters.smart==="today"} label="Today" onClick={() => { filters.setSmart("today"); setTab("schedule"); onClose(); }} />
          <Item active={filters.smart==="next7"} label="Next 7 days" onClick={() => { filters.setSmart("next7"); setTab("calendar"); onClose(); }} />
          <Item active={filters.smart==="overdue"} label="Overdue" onClick={() => { filters.setSmart("overdue"); setTab("inbox"); onClose(); }} />
          <Item active={filters.smart==="done"} label="Completed" onClick={() => { filters.setSmart("done"); setTab("inbox"); onClose(); }} />
          <Item label="Priority Matrix" onClick={() => { setTab("matrix"); onClose(); }} />
        </div>

        {folders.map(([folder, ls]) => (
          <div key={folder}>
            <SectionTitle>{folder}</SectionTitle>
            <div className="space-y-1">
              {ls.map((l) => (
                <Item
                  key={l.id}
                  active={filters.listId===l.id}
                  label={l.title}
                  onClick={() => { filters.setList(l.id); setTab("inbox"); onClose(); }}
                />
              ))}
              <Item label="+ Add list" onClick={() => { setTab("settings"); onClose(); }} />
            </div>
          </div>
        ))}

        <SectionTitle>Tags</SectionTitle>
        <div className="space-y-1">
          {tags.length ? tags.map(([t,c]) => (
            <Item key={t} active={filters.tag===t} label={`#${t}`} pill={String(c)} onClick={() => { filters.setTag(t); setTab("inbox"); onClose(); }} />
          )) : <div className="text-xs text-slate-500 px-3 py-2">No tags yet. Add #tag in Inbox.</div>}
        </div>

        <div className="mt-6 text-[11px] text-slate-400 px-3">
          Tip: use <span className="font-medium">14:00-15:00</span>, <span className="font-medium">tomorrow</span>, <span className="font-medium">#tag</span>, <span className="font-medium">@Work</span>, <span className="font-medium">!!!</span> in quick input.
        </div>
      </div>
    </div>
  );
}

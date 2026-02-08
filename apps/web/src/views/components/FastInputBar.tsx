import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { useMutation } from "@tanstack/react-query";
import type { List, Task } from "@pp/shared";
import { api } from "../../lib/api";
import { useUI } from "../../store/ui";

type Suggestion =
  | { type: "list"; value: string; label: string }
  | { type: "tag"; value: string; label: string }
  | { type: "date"; value: string; label: string }
  | { type: "time"; value: string; label: string };

function insertAtCaret(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = before + text + after;
  const newPos = start + text.length;
  input.setSelectionRange(newPos, newPos);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function findActiveTrigger(text: string, caret: number) {
  // Find the last @ or # token segment before caret
  const before = text.slice(0, caret);
  const at = Math.max(before.lastIndexOf("@"), before.lastIndexOf("#"));
  if (at === -1) return null;
  // Ensure token is not in the middle of a word
  const prev = before[at - 1];
  if (prev && /[\wа-яА-Я0-9]/.test(prev)) return null;
  const trigger = before[at];
  const query = before.slice(at + 1);
  // Stop if whitespace entered after trigger
  if (/\s/.test(query)) return null;
  return { trigger, query, index: at };
}

export default function FastInputBar({
  lists,
  existingTasks,
  onCreated
}: {
  lists: List[];
  existingTasks: Task[];
  onCreated: () => void;
}) {
  const selectedDate = useUI((s) => s.selectedDate);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<any>(null);
  const [uiParsed, setUiParsed] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const parseTimer = useRef<number | null>(null);

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const t of existingTasks) for (const tag of t.tags || []) set.add(tag);
    return Array.from(set).sort();
  }, [existingTasks]);

  const parseM = useMutation({
    mutationFn: (t: string) => api.parse(t),
    onSuccess: (data) => setParsed(data)
  });

  const createM = useMutation({
    mutationFn: (payload: any) => api.createTask(payload),
    onSuccess: () => {
      setText("");
      setParsed(null);
      setUiParsed(null);
      onCreated();
    }
  });

  function localParse(t: string) {
    const out: any = { tags: [], listHint: null, date: null, time: null, range: null, priority: 0, focusFlag: false };
    const lc = t.toLowerCase();
    // date keywords
    if (/\btoday\b/.test(lc)) out.date = dayjs().format("YYYY-MM-DD");
    if (/\btomorrow\b/.test(lc)) out.date = dayjs().add(1, "day").format("YYYY-MM-DD");
    const dow = lc.match(/\b(mon|tue|wed|thu|fri|sat|sun)\b/);
    if (!out.date && dow) {
      const map: any = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const d = dayjs().day(map[dow[1]]);
      out.date = d.isBefore(dayjs(), "day") ? d.add(7, "day").format("YYYY-MM-DD") : d.format("YYYY-MM-DD");
    }
    // @list and #tags
    const list = t.match(/(^|\s)@([\p{L}0-9_-]{2,})/u);
    if (list) out.listHint = list[2];
    const tags = Array.from(t.matchAll(/(^|\s)#([\p{L}0-9_-]{1,})/gu)).map((m) => m[2]);
    out.tags = Array.from(new Set(tags));
    // priority: p1..p3 or !!!
    const pr = lc.match(/\bp([0-3])\b/);
    if (pr) out.priority = Number(pr[1]);
    if (/!!!/.test(lc)) out.priority = 3;
    else if (/!!/.test(lc)) out.priority = Math.max(out.priority, 2);
    else if (/!/.test(lc)) out.priority = Math.max(out.priority, 1);
    // focus
    if (/\bfocus\b/.test(lc) || /\*/.test(lc)) out.focusFlag = true;
    // time range
    const range = t.match(/\b(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\b/);
    if (range) {
      out.range = `${range[1]}-${range[2]}`;
      out.time = range[1];
    } else {
      const time = t.match(/\b(\d{1,2}:\d{2})\b/);
      if (time) out.time = time[1];
    }
    return out;
  }

  // Instant UI parsing (no debounce) for chips.
  useEffect(() => {
    if (!text.trim()) {
      setParsed(null);
      setUiParsed(null);
      return;
    }
    setUiParsed(localParse(text));

    // Backend parsing (debounced) for richer extraction on submit.
    if (parseTimer.current) window.clearTimeout(parseTimer.current);
    parseTimer.current = window.setTimeout(() => {
      if (text.trim().length >= 3) parseM.mutate(text);
    }, 350);
    return () => {
      if (parseTimer.current) window.clearTimeout(parseTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const suggestions = useMemo((): Suggestion[] => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const active = findActiveTrigger(text, caret);
    const out: Suggestion[] = [];

    if (active?.trigger === "@") {
      const q = active.query.toLowerCase();
      for (const l of lists) {
        if (!q || l.title.toLowerCase().includes(q)) out.push({ type: "list", value: l.title, label: `@${l.title}` });
      }
    }

    if (active?.trigger === "#") {
      const q = active.query.toLowerCase();
      for (const t of tags) {
        if (!q || t.toLowerCase().includes(q)) out.push({ type: "tag", value: t, label: `#${t}` });
      }
      // allow creating new tag
      if (active.query && !tags.some((t) => t.toLowerCase() === active.query.toLowerCase())) {
        out.unshift({ type: "tag", value: active.query, label: `#${active.query}` });
      }
    }

    // date keyword helpers (always available if not in @/# mode)
    if (!active) {
      const lc = text.toLowerCase();
      const candidates: { k: string; d: string; label: string }[] = [
        { k: "today", d: dayjs().format("YYYY-MM-DD"), label: "Today" },
        { k: "tomorrow", d: dayjs().add(1, "day").format("YYYY-MM-DD"), label: "Tomorrow" },
        { k: "mon", d: dayjs().day(1).isBefore(dayjs()) ? dayjs().day(8).format("YYYY-MM-DD") : dayjs().day(1).format("YYYY-MM-DD"), label: "Mon" }
      ];
      for (const c of candidates) {
        if (lc.includes(c.k)) {
          out.push({ type: "date", value: c.d, label: `${c.label} (${c.d})` });
        }
      }

      // time range helper
      const m = text.match(/\b(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\b/);
      if (m) out.push({ type: "time", value: `${m[1]}-${m[2]}`, label: `Time ${m[1]}–${m[2]}` });
    }
    return out.slice(0, 7);
  }, [text, lists, tags]);

  function applySuggestion(s: Suggestion) {
    const el = inputRef.current;
    if (!el) return;

    if (s.type === "list") {
      // replace current @token with full list
      const caret = el.selectionStart ?? el.value.length;
      const active = findActiveTrigger(el.value, caret);
      if (!active) return;
      const before = el.value.slice(0, active.index);
      const after = el.value.slice(caret);
      const insert = `@${s.value} `;
      el.value = before + insert + after;
      const pos = (before + insert).length;
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (s.type === "tag") {
      const caret = el.selectionStart ?? el.value.length;
      const active = findActiveTrigger(el.value, caret);
      if (!active) return;
      const before = el.value.slice(0, active.index);
      const after = el.value.slice(caret);
      const insert = `#${s.value} `;
      el.value = before + insert + after;
      const pos = (before + insert).length;
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (s.type === "date") {
      insertAtCaret(el, ` ${s.value} `);
      return;
    }
    if (s.type === "time") {
      insertAtCaret(el, ` ${s.value} `);
    }
  }

  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!text.trim()) return;
    setError(null);
    const payload = parsed ? { ...parsed } : { ...uiParsed, title: text };

    // Attach selected date if user typed only time.
    if (!payload.date && (payload.time || payload.startAt)) payload.date = selectedDate;

    // If time but no startAt, build one.
    if (!payload.startAt && payload.time && payload.date) {
      payload.startAt = dayjs(`${payload.date}T${payload.time}:00`).toISOString();
    }

    createM.mutate(payload, {
      onError: (e: any) => {
        setError(e?.message ? String(e.message) : "Failed to add task");
      }
    });
  }

  return (
    // bottom-28 keeps the bar above the global tab navigation
    <div className="fixed left-0 right-0 bottom-28 pb-[env(safe-area-inset-bottom)] z-30">
      <div className="mx-3 mb-3 bg-white/95 backdrop-blur rounded-3xl shadow-soft border border-slate-100">
        <div className="p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={text}
                rows={1}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder='Add task… e.g. "Meet Alex tomorrow 14:00-15:00 @Work #sales !!!"'
                className="w-full resize-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
              {/* Quick chips (TickTick-like). Always available on mobile for fast planning. */}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const el = inputRef.current;
                    if (!el) return;
                    insertAtCaret(el, " today ");
                    el.focus();
                  }}
                  className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700 active:scale-[0.98]"
                >
                  Today
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const el = inputRef.current;
                    if (!el) return;
                    insertAtCaret(el, " tomorrow ");
                    el.focus();
                  }}
                  className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700 active:scale-[0.98]"
                >
                  Tomorrow
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const el = inputRef.current;
                    if (!el) return;
                    insertAtCaret(el, " 09:00 ");
                    el.focus();
                  }}
                  className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700 active:scale-[0.98]"
                >
                  9:00
                </button>
                {lists?.[0]?.title ? (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const el = inputRef.current;
                      if (!el) return;
                      insertAtCaret(el, ` @${lists[0].title} `);
                      el.focus();
                    }}
                    className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 active:scale-[0.98]"
                  >
                    @{lists[0].title}
                  </button>
                ) : null}
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const el = inputRef.current;
                    if (!el) return;
                    insertAtCaret(el, " #tag ");
                    el.focus();
                  }}
                  className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700 active:scale-[0.98]"
                >
                  #tag
                </button>
              </div>

              {(uiParsed || parsed) ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(uiParsed?.date || parsed?.date) ? (
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => applySuggestion({ type: "date", value: uiParsed?.date || parsed?.date, label: "Date" })} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 active:scale-[0.98]">
                      {uiParsed?.date || parsed?.date}
                    </button>
                  ) : null}
                  {(uiParsed?.range || uiParsed?.time || parsed?.time) ? (
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => applySuggestion({ type: "time", value: uiParsed?.range || uiParsed?.time || parsed?.time, label: "Time" })} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 active:scale-[0.98]">
                      {uiParsed?.range || uiParsed?.time || parsed?.time}
                    </button>
                  ) : null}
                  {(uiParsed?.listHint || parsed?.listHint) ? (
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => applySuggestion({ type: "list", value: uiParsed?.listHint || parsed?.listHint, label: "List" })} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 active:scale-[0.98]">
                      @{uiParsed?.listHint || parsed?.listHint}
                    </button>
                  ) : null}
                  {(uiParsed?.tags?.length || parsed?.tags?.length) ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">#{(uiParsed?.tags || parsed?.tags).join(" #")}</span>
                  ) : null}
                  {(uiParsed?.priority || parsed?.priority) ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">P{uiParsed?.priority || parsed?.priority}</span> : null}
                  {(uiParsed?.focusFlag || parsed?.focusFlag) ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Focus</span> : null}
                </div>
              ) : null}

              {error ? (
                <div className="mt-2 text-[12px] text-rose-600">{error}</div>
              ) : null}
            </div>
            <button
              onClick={submit}
              disabled={!text.trim() || createM.isPending}
              className="h-[46px] px-4 rounded-2xl bg-slate-900 text-white font-medium disabled:opacity-40"
            >
              Add
            </button>
          </div>

          {open && suggestions.length ? (
            <div className="mt-2 rounded-2xl border border-slate-100 bg-white shadow-soft overflow-hidden">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(s)}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 flex items-center justify-between"
                >
                  <span className="font-medium text-slate-800">{s.label}</span>
                  <span className="text-[11px] text-slate-400">
                    {s.type === "list" ? "List" : s.type === "tag" ? "Tag" : s.type === "date" ? "Date" : "Time"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

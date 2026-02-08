import dayjs from "dayjs";

export default function ScheduleSheet({
  open,
  title,
  onClose,
  onPick
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (isoStart: string) => void;
}) {
  if (!open) return null;
  const now = dayjs();
  const presets = [
    { label: "Today 09:00", at: now.startOf("day").add(9, "hour") },
    { label: "Today 13:00", at: now.startOf("day").add(13, "hour") },
    { label: "Today 18:00", at: now.startOf("day").add(18, "hour") },
    { label: "Tomorrow 09:00", at: now.add(1, "day").startOf("day").add(9, "hour") },
    { label: "Tomorrow 13:00", at: now.add(1, "day").startOf("day").add(13, "hour") }
  ];

  return (
    <div className="fixed inset-0 z-40">
      <div onClick={onClose} className="absolute inset-0 bg-black/20" />
      <div className="absolute left-0 right-0 bottom-0 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-3 mb-3 bg-white rounded-3xl shadow-soft border border-slate-100 overflow-hidden">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Schedule</div>
                <div className="text-xs text-slate-500 truncate max-w-[70vw]">{title}</div>
              </div>
              <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-slate-100">✕</button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => onPick(p.at.toISOString())}
                  className="px-3 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-left"
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-[11px] text-slate-500">{p.at.format("ddd, D MMM")}</div>
                </button>
              ))}
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              Tip: you can also type time directly in the input, e.g. <span className="font-medium">14:00-15:00</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

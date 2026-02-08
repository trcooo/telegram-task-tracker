import { useState } from "react";

export default function TaskEditor({
  title,
  onClose,
  onSubmit,
  loading
}: {
  title: string;
  onClose: () => void;
  onSubmit: (v: { title: string; description?: string }) => void;
  loading?: boolean;
}) {
  const [t, setT] = useState("");
  const [d, setD] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 modal-backdrop" onClick={onClose} />
      <div className="relative w-full p-3 pb-5 safe-bottom">
        <div className="card p-4">
          <div className="font-semibold text-base">{title}</div>

          <div className="mt-3">
            <div className="text-xs text-slate-600 mb-1">Название</div>
            <input
              className="w-full px-3 py-2 rounded-xl bg-white/70 border border-slate-200/70"
              value={t}
              onChange={(e) => setT(e.target.value)}
              placeholder="Например: Купить продукты"
            />
          </div>

          <div className="mt-3">
            <div className="text-xs text-slate-600 mb-1">Описание</div>
            <textarea
              className="w-full px-3 py-2 rounded-xl bg-white/70 border border-slate-200/70 min-h-[80px]"
              value={d}
              onChange={(e) => setD(e.target.value)}
              placeholder="Необязательно"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={onClose}>
              Отмена
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={() => onSubmit({ title: t.trim(), description: d.trim() || undefined })}
              disabled={loading || !t.trim()}
            >
              {loading ? "..." : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

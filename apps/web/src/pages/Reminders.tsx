import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, qs } from "../lib/api";
import type { ReminderDto } from "../types/api";
import { formatDistanceToNowStrict } from "date-fns";

export default function Reminders() {
  const qc = useQueryClient();

  const remindersQ = useQuery({
    queryKey: ["reminders"],
    queryFn: () => apiFetch<{ items: ReminderDto[] }>(`/api/reminders${qs({ status: "PENDING" })}`),
    refetchInterval: 15_000
  });

  const snoozeM = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      apiFetch(`/api/reminders/${id}/snooze`, { method: "POST", body: JSON.stringify({ minutes }) }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["reminders"] })
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/reminders/${id}/cancel`, { method: "POST" }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["reminders"] })
  });

  const items = remindersQ.data?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Reminder Center</div>
        <div className="text-xs text-slate-500">{items.length} active</div>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((r) => {
          const when = new Date(r.remindAt);
          return (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.taskTitle}</div>
                  <div className="text-xs text-slate-600 mt-1">⏰ Через {formatDistanceToNowStrict(when, { addSuffix: false })}</div>
                </div>
                <button className="btn btn-ghost" onClick={() => cancelM.mutate(r.id)} disabled={cancelM.isPending}>
                  Cancel
                </button>
              </div>

              <div className="mt-3 flex gap-2">
                <button className="btn btn-primary flex-1" onClick={() => snoozeM.mutate({ id: r.id, minutes: 10 })} disabled={snoozeM.isPending}>
                  +10 min
                </button>
                <button className="btn btn-ghost flex-1" onClick={() => snoozeM.mutate({ id: r.id, minutes: 60 })} disabled={snoozeM.isPending}>
                  +1 hour
                </button>
              </div>
            </div>
          );
        })}

        {!remindersQ.isLoading && items.length === 0 && (
          <div className="card p-4 text-sm text-slate-500">
            Активных напоминаний нет. В Inbox нажми “Snooze” на задаче, чтобы создать напоминание на 10 минут.
          </div>
        )}
      </div>
    </div>
  );
}

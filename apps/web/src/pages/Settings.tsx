import { useAuthStore } from "../store/auth";
import { getWebApp } from "../lib/tg";

export default function Settings() {
  const { user, logout } = useAuthStore();
  const wa = getWebApp();

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "User";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Settings</div>
      </div>

      <div className="mt-3 card p-4 flex items-center gap-3">
        {user?.photoUrl ? (
          <img src={user.photoUrl} className="h-14 w-14 rounded-2xl border border-slate-200/70" />
        ) : (
          <div className="h-14 w-14 rounded-2xl bg-white/70 border border-slate-200/70" />
        )}
        <div className="min-w-0">
          <div className="font-semibold truncate">{name}</div>
          <div className="text-xs text-slate-600 mt-1">{user?.username ? `@${user.username}` : `tgId: ${user?.tgId ?? "-"}`}</div>
        </div>
      </div>

      <div className="mt-3 card p-4">
        <div className="text-sm font-semibold">Telegram</div>
        <div className="mt-2 text-xs text-slate-600 break-words">initDataUnsafe: {wa?.initDataUnsafe ? "available" : "no"}</div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => wa?.close?.()}>
            Close mini app
          </button>
          <button className="btn btn-primary flex-1" onClick={() => wa?.expand?.()}>
            Expand
          </button>
        </div>
      </div>

      <div className="mt-3 card p-4">
        <div className="text-sm font-semibold">Account</div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => logout()}>
            Logout
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">Logout удаляет локальный токен. При следующем открытии mini app снова пройдёт Telegram login.</div>
      </div>

      <div className="mt-3 card p-4">
        <div className="text-sm font-semibold">Tips</div>
        <ul className="mt-2 text-xs text-slate-600 list-disc pl-5 space-y-1">
          <li>Чтобы напоминания приходили, пользователь должен хотя бы раз нажать /start у бота.</li>
          <li>Inbox → “Snooze” создаёт reminder на +10 минут.</li>
          <li>Schedule — закрепляй задачи по времени через “Set time”.</li>
          <li>Matrix — перетаскивай задачи по квадрантам.</li>
        </ul>
      </div>
    </div>
  );
}

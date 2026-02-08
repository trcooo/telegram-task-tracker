import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "../store/auth";
import type { UserDto } from "../types/api";

export default function TopBar() {
  const { user, setUser } = useAuthStore();

  useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await apiFetch<{ user: UserDto }>("/api/me");
      setUser(res.user);
      return res.user;
    },
    staleTime: 60_000
  });

  const title = "Планировщик дня";
  const subtitle = user?.username ? `@${user.username}` : [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  return (
    <div className="px-4 pt-5">
      <div className="card px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-base font-semibold leading-tight">{title}</div>
          <div className="text-xs text-slate-500 mt-1">{subtitle || "Telegram Mini App"}</div>
        </div>
        <div className="flex items-center gap-2">
          {user?.photoUrl ? (
            <img src={user.photoUrl} className="h-10 w-10 rounded-2xl border border-slate-200/70" />
          ) : (
            <div className="h-10 w-10 rounded-2xl bg-white/70 border border-slate-200/70" />
          )}
        </div>
      </div>
    </div>
  );
}

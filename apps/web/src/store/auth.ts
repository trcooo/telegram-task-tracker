import { create } from "zustand";
import { getInitData } from "../lib/tg";
import type { UserDto } from "../types/api";

type AuthState = {
  token: string | null;
  user: UserDto | null;
  isReady: boolean;
  error?: string;
  login: () => Promise<void>;
  logout: () => void;
  setUser: (u: UserDto) => void;
};

const TOKEN_KEY = "tg_planner_token";

function safeGetToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function safeSetToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export const useAuthStore = create<AuthState>((set) => ({
  token: safeGetToken(),
  user: null,
  isReady: false,

  setUser(u) { set({ user: u }); },

  async login() {
    const initData = getInitData();
    if (!initData) {
      set({ isReady: true, error: "Открой mini app из Telegram (нет initData)." });
      return;
    }

    const res = await fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData })
    });

    if (!res.ok) {
      set({ isReady: true, error: await res.text() });
      return;
    }

    const data = (await res.json()) as { token: string; user: UserDto };
    safeSetToken(data.token);
    set({ token: data.token, user: data.user, isReady: true, error: undefined });
  },

  logout() {
    safeSetToken(null);
    set({ token: null, user: null, isReady: true });
  }
}));

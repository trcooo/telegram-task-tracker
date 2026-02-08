import { getInitData } from "./telegram";
import type { AuthResponse, Task, List, Stats } from "@pp/shared";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

function getToken() {
  return localStorage.getItem("pp_token");
}

export async function ensureAuth(): Promise<AuthResponse> {
  const token = getToken();
  if (token) {
    // optimistic – backend will reject if invalid; caller can re-auth
    return { token, user: { id: "me", telegramId: null, name: null } };
  }
  const initData = getInitData();
  if (!initData) {
    // dev fallback
    const fake = "dev";
    localStorage.setItem("pp_token", fake);
    return { token: fake, user: { id: "dev", telegramId: null, name: "Dev" } };
  }
  const res = await fetch(`${API_BASE}/api/auth/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as AuthResponse;
  localStorage.setItem("pp_token", data.token);
  return data;
}

async function authedFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let token = getToken();
  // If user types fast right after opening the Mini App, ensureAuth may not have finished yet.
  // This makes all write actions reliable.
  if (!token) {
    try {
      const auth = await ensureAuth();
      token = auth.token;
    } catch {
      // continue; backend will respond with 401 and UI can show the error
    }
  }
  const headers: Record<string,string> = {
    ...(init?.headers as any),
    "content-type": "application/json",
  };
  const initData = getInitData();
  if (initData) headers["x-tg-init-data"] = initData;

  if (token && token !== "dev") headers.authorization = `Bearer ${token}`;
  // dev fallback: no auth middleware? In this project API requires auth; for dev token won't work.
  if (!headers.authorization) headers.authorization = `Bearer ${token || ""}`;
  let res = await fetch(`${API_BASE}${url}`, { ...init, headers });
  if (res.status === 401) {
    // Token might be stale (JWT_SECRET rotated). Re-auth with Telegram initData and retry once.
    localStorage.removeItem("pp_token");
    try {
      const auth = await ensureAuth();
      headers.authorization = `Bearer ${auth.token}`;
      res = await fetch(`${API_BASE}${url}`, { ...init, headers });
    } catch {
      // fall through
    }
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  lists: () => authedFetch<List[]>(`/api/lists`),
  createList: (payload: Partial<List> & { title: string }) =>
    authedFetch<List>(`/api/lists`, { method: "POST", body: JSON.stringify(payload) }),

  tasks: (params?: { view?: string; date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.view) qs.set("view", params.view);
    if (params?.date) qs.set("date", params.date);
    const q = qs.toString();
    return authedFetch<Task[]>(`/api/tasks${q ? `?${q}` : ""}`);
  },
  parse: (text: string) => authedFetch(`/api/tasks/parse`, { method: "POST", body: JSON.stringify({ text }) }),
  createTask: (payload: any) => authedFetch<Task>(`/api/tasks`, { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (id: string, payload: any) => authedFetch<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteTask: (id: string) => authedFetch<{ok:true}>(`/api/tasks/${id}`, { method: "DELETE" }),

  reminders: (mode: "upcoming"|"snoozed"|"sent" = "upcoming") => authedFetch<any[]>(`/api/reminders?mode=${mode}`),
  snooze: (id: string, minutes: number) => authedFetch<any>(`/api/reminders/${id}/snooze`, { method: "POST", body: JSON.stringify({ minutes }) }),

  stats: () => authedFetch<Stats>(`/api/stats`)
};

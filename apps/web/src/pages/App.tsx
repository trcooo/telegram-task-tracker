import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import TopBar from "../components/TopBar";
import TabBar from "../components/TabBar";

import Inbox from "./Inbox";
import Calendar from "./Calendar";
import Schedule from "./Schedule";
import Matrix from "./Matrix";
import Reminders from "./Reminders";
import Settings from "./Settings";

export default function App() {
  const { login, isReady, error, token } = useAuthStore();

  useEffect(() => {
    if (!token) login();
  }, [token, login]);

  if (!isReady && !token) return <div className="p-4 text-sm text-slate-600">Загрузка…</div>;

  if (error && !token) {
    return (
      <div className="p-4">
        <div className="card p-4">
          <div className="font-semibold">Не удалось войти</div>
          <div className="text-sm text-slate-600 mt-2 break-words">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar />
      <div className="px-4 pt-3">
        <Routes>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/matrix" element={<Matrix />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <TabBar />
    </div>
  );
}

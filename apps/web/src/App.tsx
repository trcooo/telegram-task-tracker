import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { api, ensureAuth } from "./lib/api";
import { readyTelegram } from "./lib/telegram";
import { useUI } from "./store/ui";
import Inbox from "./views/Inbox";
import CalendarView from "./views/Calendar";
import Schedule from "./views/Schedule";
import Matrix from "./views/Matrix";
import ReminderCenter from "./views/Reminders";
import Settings from "./views/Settings";
import SideMenu from "./views/SideMenu";

function TabButton({ id, label }: { id: any; label: string }) {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const active = tab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 py-2 rounded-xl text-sm font-medium ${active ? "bg-white shadow-soft" : "text-slate-500"}`}
    >
      {label}
    </button>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const tab = useUI((s) => s.tab);
  const selectedDate = useUI((s) => s.selectedDate);

  useEffect(() => {
    readyTelegram();
    ensureAuth().catch(() => {
      // ignore; UI will show error in queries
    });
  }, []);

  const listsQ = useQuery({ queryKey: ["lists"], queryFn: api.lists });
  const statsQ = useQuery({ queryKey: ["stats"], queryFn: api.stats });

  const title = useMemo(() => {
    const map: any = {
      inbox: "Inbox",
      calendar: "Calendar",
      schedule: "Schedule",
      matrix: "Priority Matrix",
      reminders: "Reminder Center",
      settings: "Settings"
    };
    return map[tab] || "Planner";
  }, [tab]);

  const subtitle = tab === "schedule" || tab === "calendar"
    ? dayjs(selectedDate).format("ddd, D MMM")
    : tab === "inbox"
      ? "Quick capture + smart parsing"
      : tab === "matrix"
        ? "Drag tasks by priority & urgency"
        : tab === "reminders"
          ? "Upcoming / snoozed / sent"
          : "Light, airy, card-based";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-md mx-auto px-4 pb-24">
        <header className="pt-5 pb-3 flex items-center justify-between">
          <button
            onClick={() => setMenuOpen(true)}
            className="w-10 h-10 rounded-2xl bg-white shadow-soft flex items-center justify-center"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="text-center flex-1">
            <div className="text-lg font-semibold">{title}</div>
            <div className="text-xs text-slate-500">{subtitle}</div>
          </div>
          <div className="w-10 h-10" />
        </header>

        <div className="mb-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl shadow-soft p-3">
              <div className="text-xs text-slate-500">Today</div>
              <div className="text-2xl font-semibold">{statsQ.data?.todayCount ?? "—"}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-soft p-3">
              <div className="text-xs text-slate-500">Overdue</div>
              <div className="text-2xl font-semibold">{statsQ.data?.overdueCount ?? "—"}</div>
            </div>
          </div>
        </div>

        {tab === "inbox" && <Inbox lists={listsQ.data || []} />}
        {tab === "calendar" && <CalendarView lists={listsQ.data || []} />}
        {tab === "schedule" && <Schedule lists={listsQ.data || []} />}
        {tab === "matrix" && <Matrix lists={listsQ.data || []} />}
        {tab === "reminders" && <ReminderCenter />}
        {tab === "settings" && <Settings />}

        <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} lists={listsQ.data || []} />
      </div>

      <nav className="fixed bottom-3 left-0 right-0">
        <div className="max-w-md mx-auto px-3">
          <div className="bg-slate-100/80 backdrop-blur rounded-2xl p-2 shadow-soft flex gap-2">
            <TabButton id="inbox" label="Inbox" />
            <TabButton id="calendar" label="Cal" />
            <TabButton id="schedule" label="Day" />
            <TabButton id="matrix" label="Matrix" />
          </div>
          <div className="mt-2 bg-slate-100/80 backdrop-blur rounded-2xl p-2 shadow-soft flex gap-2">
            <TabButton id="reminders" label="Remind" />
            <TabButton id="settings" label="Settings" />
          </div>
        </div>
      </nav>
    </div>
  );
}

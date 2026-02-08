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

function TabButton({ id, label, icon }: { id: any; label: string; icon: string }) {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const active = tab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 py-2 rounded-xl text-[11px] font-medium flex flex-col items-center justify-center gap-0.5 ${active ? "bg-white shadow-soft" : "text-slate-500"}`}
    >
      <span className={`text-base ${active ? "text-slate-900" : "text-slate-500"}`}>{icon}</span>
      <span>{label}</span>
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
    <div className="min-h-screen">
      <div className="max-w-[420px] mx-auto px-4 pb-24">
        <header className="pt-6 pb-4 flex items-center justify-between">
          <button
            onClick={() => setMenuOpen(true)}
            className="w-10 h-10 rounded-2xl card-solid flex items-center justify-center"
            aria-label="Open menu"
          >
            <span className="text-lg">☰</span>
          </button>
          <div className="text-center flex-1">
            <div className="text-lg font-semibold tracking-tight">{title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
          </div>
          <div className="w-10 h-10" />
        </header>

        <div className="mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <div className="text-xs text-slate-500">Today</div>
              <div className="text-2xl font-semibold">{statsQ.data?.todayCount ?? "—"}</div>
            </div>
            <div className="card p-3">
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
        <div className="max-w-[420px] mx-auto px-3">
          <div className="tabbar p-2 flex gap-2">
            <TabButton id="inbox" label="Inbox" icon="📥" />
            <TabButton id="calendar" label="Calendar" icon="🗓️" />
            <TabButton id="schedule" label="Schedule" icon="⏱️" />
            <TabButton id="matrix" label="Matrix" icon="🧭" />
            <TabButton id="reminders" label="Reminders" icon="⏰" />
          </div>
        </div>
      </nav>
    </div>
  );
}

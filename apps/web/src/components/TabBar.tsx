import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/inbox", label: "Inbox" },
  { to: "/calendar", label: "Calendar" },
  { to: "/schedule", label: "Schedule" },
  { to: "/matrix", label: "Priority" },
  { to: "/reminders", label: "Reminders" },
  { to: "/settings", label: "Settings" }
];

export default function TabBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 safe-bottom">
      <div className="mx-3 mb-3 card px-2 py-2 flex justify-between text-xs">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-2 py-2 rounded-xl whitespace-nowrap ${
                isActive ? "bg-slate-900 text-white" : "text-slate-600"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

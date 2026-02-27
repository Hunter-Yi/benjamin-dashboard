import React, { useState, useEffect } from "react";
import AgentStatus from "./components/AgentStatus.jsx";
import ResourceDashboard from "./components/ResourceDashboard.jsx";
import ScheduledTasks from "./components/ScheduledTasks.jsx";
import KanbanBoard from "./components/KanbanBoard.jsx";
import RealtimePanel from "./components/RealtimePanel.jsx";

const TABS = [
  { id: "agents", label: "에이전트 현황", icon: "🤖" },
  { id: "resources", label: "리소스 현황", icon: "📊" },
  { id: "schedule", label: "예약 작업", icon: "📅" },
  { id: "kanban", label: "칸반 보드", icon: "📋" },
  { id: "realtime", label: "실시간", icon: "⚡" },
];

export default function App() {
  const [tab, setTab] = useState("agents");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center font-bold text-sm">B</div>
            <h1 className="text-lg font-semibold text-zinc-100">Benjamin Command Center</h1>
          </div>
          <div className="text-xs text-zinc-500">
            {now.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-[1600px] mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                tab === t.id
                  ? "border-violet-500 text-violet-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[1600px] mx-auto p-4">
        {tab === "agents" && <AgentStatus />}
        {tab === "resources" && <ResourceDashboard />}
        {tab === "schedule" && <ScheduledTasks />}
        {tab === "kanban" && <KanbanBoard />}
        {tab === "realtime" && <RealtimePanel />}
      </main>
    </div>
  );
}

import React, { useState, useEffect } from "react";

const STATUS_STYLES = {
  active: { dot: "bg-emerald-400 animate-pulse", label: "활성", bg: "border-emerald-500/30" },
  idle: { dot: "bg-amber-400", label: "대기", bg: "border-amber-500/30" },
  offline: { dot: "bg-zinc-500", label: "오프라인", bg: "border-zinc-700" },
};

const AGENT_ICONS = {
  main: "🧠", researcher: "🔍", builder: "🔨", tester: "🧪",
  integrator: "🔗", reviewer: "👁", optimizer: "⚡",
};

const AGENT_ROLES = {
  main: "총괄 에이전트", researcher: "리서치 에이전트", builder: "빌더 에이전트",
  tester: "테스터 에이전트", integrator: "통합 에이전트", reviewer: "리뷰어 에이전트",
  optimizer: "최적화 에이전트",
};

const EVENT_ICONS = { start: "🔧", checkpoint: "📍", complete: "✅", error: "❌" };

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AgentStatus() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const fetchAgents = () => {
    fetch(`${import.meta.env.BASE_URL}api/agents`)
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const wsUrl = `${proto}//${window.location.host}${base}/ws/logs`;
    let ws, unmounted = false;
    function connect() {
      if (unmounted) return;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "agent_event") fetchAgents();
        } catch {}
      };
      ws.onclose = () => { if (!unmounted) setTimeout(connect, 3000); };
    }
    connect();
    return () => { unmounted = true; if (ws) ws.close(); };
  }, []);

  const openModal = (agent) => {
    setSelectedAgent(agent);
    setEventsLoading(true);
    fetch(`${import.meta.env.BASE_URL}api/agent-events?agent=${agent.id}&limit=20`)
      .then((r) => r.json())
      .then((data) => setEvents(data))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  };

  const closeModal = () => {
    setSelectedAgent(null);
    setEvents([]);
  };

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") closeModal(); };
    if (selectedAgent) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [selectedAgent]);

  if (loading) return <Loading />;

  return (
    <div>
      <SectionHeader title="에이전트 현황" subtitle={`${agents.filter(a => a.status === "active").length}/${agents.length} 활성`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map((agent) => {
          const st = STATUS_STYLES[agent.status] || STATUS_STYLES.offline;
          return (
            <div
              key={agent.id}
              onClick={() => openModal(agent)}
              className={`rounded-xl border ${st.bg} bg-zinc-900/60 p-4 hover:bg-zinc-800/60 transition-colors cursor-pointer`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{AGENT_ICONS[agent.id]}</span>
                  <div>
                    <div className="font-semibold text-sm text-zinc-100">{agent.id}</div>
                    <div className="text-xs text-zinc-500">{AGENT_ROLES[agent.id]}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                  <span className="text-xs text-zinc-400">{st.label}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">마지막 활동</span>
                  <span className="text-zinc-300">{timeAgo(agent.lastActivity)}</span>
                </div>
                {agent.currentTask && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">현재 작업</span>
                    <span className="text-zinc-300 truncate max-w-[160px]">{agent.currentTask}</span>
                  </div>
                )}
              </div>

              {/* Color bar */}
              <div className="mt-3 h-1 rounded-full" style={{ backgroundColor: agent.color, opacity: agent.status === "active" ? 1 : 0.3 }} />
            </div>
          );
        })}
      </div>

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{AGENT_ICONS[selectedAgent.id]}</span>
                <div>
                  <div className="font-semibold text-zinc-100">{selectedAgent.id}</div>
                  <div className="text-xs text-zinc-500">{AGENT_ROLES[selectedAgent.id]}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${(STATUS_STYLES[selectedAgent.status] || STATUS_STYLES.offline).dot}`} />
                  <span className="text-sm text-zinc-400">{(STATUS_STYLES[selectedAgent.status] || STATUS_STYLES.offline).label}</span>
                </div>
                <button onClick={closeModal} className="text-zinc-500 hover:text-zinc-300 text-lg">&times;</button>
              </div>
            </div>

            {/* Info */}
            <div className="p-5 space-y-2 text-sm border-b border-zinc-800">
              <div className="flex justify-between">
                <span className="text-zinc-500">마지막 활동</span>
                <span className="text-zinc-300">{timeAgo(selectedAgent.lastActivity)}</span>
              </div>
              {selectedAgent.currentTask && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">현재 작업</span>
                  <span className="text-zinc-300">{selectedAgent.currentTask}</span>
                </div>
              )}
              {selectedAgent.workspace && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">워크스페이스</span>
                  <span className="text-zinc-300 text-xs font-mono">{selectedAgent.workspace}</span>
                </div>
              )}
            </div>

            {/* Event Timeline */}
            <div className="p-5 overflow-y-auto" style={{ maxHeight: "40vh" }}>
              <h4 className="text-sm font-semibold text-zinc-400 mb-3">최근 이벤트</h4>
              {eventsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full" />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center text-zinc-600 text-sm py-6">이벤트 없음</div>
              ) : (
                <div className="space-y-2">
                  {[...events].reverse().map((evt) => (
                    <div key={evt.id} className="flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                      <span className="text-base mt-0.5">{EVENT_ICONS[evt.event] || "📋"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200">{evt.message}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{formatTime(evt.timestamp)} · {evt.event}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Color bar */}
            <div className="h-1" style={{ backgroundColor: selectedAgent.color }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      {subtitle && <span className="text-sm text-zinc-400">{subtitle}</span>}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );
}

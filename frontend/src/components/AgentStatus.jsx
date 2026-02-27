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

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function AgentStatus() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
              className={`rounded-xl border ${st.bg} bg-zinc-900/60 p-4 hover:bg-zinc-800/60 transition-colors`}
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

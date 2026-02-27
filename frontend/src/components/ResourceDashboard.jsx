import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"];

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function ResourceDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/resources`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <Loading />;

  const barData = Object.entries(data.tokensByAgent).map(([name, v]) => ({
    name,
    input: v.input,
    output: v.output,
  }));

  const pieData = Object.entries(data.tokensByAgent)
    .map(([name, v]) => ({ name, value: v.input + v.output }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="총 토큰" value={formatTokens(data.totalInput + data.totalOutput)} sub={`입력 ${formatTokens(data.totalInput)} / 출력 ${formatTokens(data.totalOutput)}`} />
        <StatCard label="추정 비용" value={`$${data.estimatedCost}`} sub="$3/M in · $15/M out" accent />
        <StatCard label="세션 / 메모리" value={`${data.sessionCount} / ${data.memoryFileCount}`} sub="활성 세션 · 메모리 파일" />
        <StatCard label="크론잡" value={`${data.cronStats.ok}/${data.cronStats.total}`} sub={data.cronStats.failed > 0 ? `${data.cronStats.failed} 실패` : "전체 성공"} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">에이전트별 토큰 사용량</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
              <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={formatTokens} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#e4e4e7" }}
                formatter={(v) => formatTokens(v)}
              />
              <Bar dataKey="input" name="입력" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="output" name="출력" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">에이전트별 비용 비율</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                formatter={(v) => formatTokens(v)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-zinc-400">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-violet-400" : "text-zinc-100"}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{sub}</div>
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

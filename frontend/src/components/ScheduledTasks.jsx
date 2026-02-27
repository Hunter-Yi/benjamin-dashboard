import React, { useState, useEffect } from "react";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ScheduledTasks() {
  const [crons, setCrons] = useState([]);
  const [memory, setMemory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/crons").then((r) => r.json()),
      fetch("/api/memory/summary").then((r) => r.json()),
    ])
      .then(([c, m]) => { setCrons(c); setMemory(m); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {/* Cron Jobs Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-200">크론잡 목록</h3>
          <span className="text-xs text-zinc-500">{crons.length}개 등록됨</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                <th className="text-left px-4 py-2 font-medium">이름</th>
                <th className="text-left px-4 py-2 font-medium">스케줄</th>
                <th className="text-left px-4 py-2 font-medium">다음 실행</th>
                <th className="text-left px-4 py-2 font-medium">마지막 결과</th>
                <th className="text-left px-4 py-2 font-medium">소요시간</th>
                <th className="text-center px-4 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {crons.map((job) => (
                <tr key={job.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-200">{job.name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 max-w-[250px] truncate">{job.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-violet-300">{job.schedule}</code>
                    <div className="text-xs text-zinc-500 mt-0.5">{job.timezone}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 text-xs">{formatDate(job.nextRun)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                      job.lastStatus === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {job.lastStatus === "ok" ? "✓" : "✗"} {job.lastStatus}
                    </span>
                    {job.consecutiveErrors > 0 && (
                      <span className="text-xs text-red-400 ml-2">연속 {job.consecutiveErrors}회 실패</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{formatDuration(job.lastDurationMs)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className={`w-2 h-2 rounded-full mx-auto ${job.enabled ? "bg-emerald-400" : "bg-zinc-600"}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Memory Summary */}
      {memory && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="text-sm font-medium text-zinc-200 mb-3">메모리 AI 요약</h3>
          <p className="text-sm text-zinc-400 mb-4">{memory.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {memory.todayFiles?.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-violet-400 mb-2">오늘 메모리</h4>
                <div className="space-y-1">
                  {memory.todayFiles.map((f) => (
                    <div key={f} className="text-xs text-zinc-400 bg-zinc-800/50 rounded px-2 py-1">{f}</div>
                  ))}
                </div>
              </div>
            )}
            {memory.projectFiles?.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-blue-400 mb-2">프로젝트 관련</h4>
                <div className="space-y-1">
                  {memory.projectFiles.map((f) => (
                    <div key={f} className="text-xs text-zinc-400 bg-zinc-800/50 rounded px-2 py-1">{f}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent memory files */}
          <div className="mt-4">
            <h4 className="text-xs font-medium text-zinc-400 mb-2">최근 메모리 파일</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {memory.files?.slice(0, 10).map((f) => (
                <div key={f.name} className="flex items-center justify-between text-xs bg-zinc-800/30 rounded px-3 py-1.5">
                  <span className="text-zinc-300">{f.name}</span>
                  <span className="text-zinc-500">{formatDate(f.modified)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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

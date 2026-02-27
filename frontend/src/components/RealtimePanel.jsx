import React, { useState, useEffect, useRef, useCallback } from "react";

const LOG_LEVEL_STYLES = {
  INFO: "text-blue-400",
  WARN: "text-amber-400",
  ERROR: "text-red-400",
  RAW: "text-zinc-400",
};

export default function RealtimePanel() {
  const [activeTab, setActiveTab] = useState("logs");

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {[
          { id: "logs", label: "로그 스트리밍", icon: "📜" },
          { id: "telegram", label: "텔레그램 피드", icon: "💬" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeTab === t.id ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === "logs" && <LogStreaming />}
      {activeTab === "telegram" && <TelegramFeed />}
    </div>
  );
}

function LogStreaming() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/ws/logs`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        setLogs((prev) => [...prev.slice(-500), data]);
      } catch {}
    };

    return () => { ws.close(); };
  }, []);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          <span className="text-xs text-zinc-400">{connected ? "실시간 연결" : "연결 끊김"}</span>
          <span className="text-xs text-zinc-500">({logs.length}줄)</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-violet-500" />
            자동 스크롤
          </label>
          <button onClick={() => setLogs([])} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">지우기</button>
        </div>
      </div>
      <div ref={containerRef} className="log-container h-[500px] overflow-y-auto p-3 space-y-0.5">
        {logs.length === 0 && (
          <div className="text-center text-zinc-600 py-20">로그 대기중...</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 leading-5 hover:bg-zinc-800/30 px-1 rounded">
            {log.time && (
              <span className="text-zinc-600 shrink-0 w-20">
                {new Date(log.time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <span className={`shrink-0 w-12 ${LOG_LEVEL_STYLES[log.level] || "text-zinc-500"}`}>{log.level}</span>
            <span className="text-zinc-300 break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TelegramFeed() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMessages = useCallback(() => {
    fetch("/api/telegram/feed")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        setMessages(data.messages || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 30000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">💬</span>
          <span className="text-sm text-zinc-300">JY-Plan Ops 텔레그램 피드</span>
        </div>
        <button onClick={fetchMessages} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">새로고침</button>
      </div>
      <div className="max-h-[500px] overflow-y-auto p-3 space-y-2">
        {loading && <div className="text-center text-zinc-600 py-10">로딩중...</div>}
        {error && <div className="text-xs text-amber-400 bg-amber-500/10 rounded p-2">⚠️ {error}</div>}
        {!loading && messages.length === 0 && !error && (
          <div className="text-center text-zinc-600 py-10">메시지 없음</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-violet-400">{msg.fromUser || msg.chatTitle}</span>
              <span className="text-[10px] text-zinc-500">
                {msg.date ? new Date(msg.date * 1000).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{msg.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

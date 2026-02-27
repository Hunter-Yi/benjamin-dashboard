"""Benjamin Command Center — FastAPI Backend."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import glob as globmod
import subprocess
import uuid
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Dict, List, Any

from dotenv import load_dotenv
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import httpx

load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────
OPENCLAW_DIR = Path.home() / ".openclaw"
OPENCLAW_CONFIG = OPENCLAW_DIR / "openclaw.json"
CRON_JOBS_FILE = OPENCLAW_DIR / "cron" / "jobs.json"
MEMORY_DIR = OPENCLAW_DIR / "workspace" / "memory"
SESSIONS_FILE = OPENCLAW_DIR / "agents" / "main" / "sessions" / "sessions.json"
LOG_DIR = Path("/tmp/openclaw")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
KANBAN_FILE = DATA_DIR / "kanban.json"
AGENT_EVENTS_FILE = DATA_DIR / "agent-events.json"
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_GROUP_ID = os.environ.get("TELEGRAM_GROUP_ID", "")

AGENT_IDS = ["main", "researcher", "builder", "tester", "integrator", "reviewer", "optimizer"]
AGENT_COLORS = {
    "main": "#8b5cf6",
    "researcher": "#3b82f6",
    "builder": "#10b981",
    "tester": "#f59e0b",
    "integrator": "#ef4444",
    "reviewer": "#ec4899",
    "optimizer": "#06b6d4",
}

# Token cost rates (per million tokens)
INPUT_COST_PER_M = 3.0
OUTPUT_COST_PER_M = 15.0

app = FastAPI(title="Benjamin Command Center")

_file_lock = asyncio.Lock()


# ── Helpers ────────────────────────────────────────────────────────────
def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def _today_log_path() -> Path:
    return LOG_DIR / f"openclaw-{date.today().isoformat()}.log"


def _parse_log_line(raw: str) -> dict | None:
    try:
        obj = json.loads(raw)
        msg = obj.get("0", "")
        ts = obj.get("time", "")
        level = obj.get("_meta", {}).get("logLevelName", "INFO")
        return {"time": ts, "level": level, "message": msg}
    except Exception:
        if raw.strip():
            return {"time": "", "level": "RAW", "message": raw.strip()}
        return None


def _get_agent_sessions() -> dict:
    data = _load_json(SESSIONS_FILE)
    if not data:
        return {}
    return data


def _get_per_agent_session_info(agent_id: str) -> dict:
    """Check per-agent session directory for activity timestamps."""
    agent_sessions_dir = OPENCLAW_DIR / "agents" / agent_id / "sessions"
    info: dict = {"last_modified": 0, "session_count": 0, "active_sessions": []}

    if not agent_sessions_dir.exists():
        return info

    # Check for sessions.json in agent-specific dir
    agent_sessions_file = agent_sessions_dir / "sessions.json"
    if agent_sessions_file.exists():
        agent_data = _load_json(agent_sessions_file)
        if agent_data:
            for key, session in agent_data.items():
                updated = session.get("updatedAt", 0)
                if updated > info["last_modified"]:
                    info["last_modified"] = updated
                info["active_sessions"].append(key)

    # Also check .jsonl session files (active, not deleted/reset)
    for f in agent_sessions_dir.glob("*.jsonl"):
        if ".deleted." in f.name or ".reset." in f.name:
            continue
        info["session_count"] += 1
        try:
            mtime_ms = int(f.stat().st_mtime * 1000)
            if mtime_ms > info["last_modified"]:
                info["last_modified"] = mtime_ms
        except Exception:
            pass

    return info


def _find_agent_in_session_keys(sessions: dict) -> dict:
    """Parse session keys to find activity for each agent."""
    agent_activity: dict = {}
    for key, session in sessions.items():
        # Keys like "agent:researcher:main", "agent:builder:main"
        parts = key.split(":")
        if len(parts) >= 2 and parts[0] == "agent":
            aid = parts[1]
            updated = session.get("updatedAt", 0)
            if aid not in agent_activity or updated > agent_activity[aid]["updatedAt"]:
                agent_activity[aid] = {
                    "updatedAt": updated,
                    "sessionKey": key,
                    "origin": session.get("origin", {}),
                    "sessionId": session.get("sessionId", ""),
                }
    return agent_activity


def _detect_spawn_in_logs() -> dict:
    """Scan today's log for coding-agent spawns and agent activations."""
    spawn_times: dict = {}
    log_path = _today_log_path()
    if not log_path.exists():
        return spawn_times

    try:
        agent_names_lower = {a.lower(): a for a in AGENT_IDS}
        with open(log_path, "r", errors="replace") as f:
            for line in f:
                line_lower = line.lower()
                # Detect coding-agent skill invocations (spawn events)
                if "coding-agent" in line_lower or "coding_agent" in line_lower:
                    try:
                        obj = json.loads(line)
                        ts = obj.get("time", "")
                        if ts:
                            # Check if any agent name is referenced
                            for name_lower, name in agent_names_lower.items():
                                if name_lower in line_lower and name != "main":
                                    spawn_times[name] = ts
                            # If no specific agent found, record as generic spawn
                            if not any(n in spawn_times for n in AGENT_IDS[1:]):
                                spawn_times.setdefault("_last_spawn", ts)
                    except Exception:
                        pass
                # Detect "lane task done" for specific agents
                elif "lane task done" in line_lower:
                    try:
                        obj = json.loads(line)
                        msg = obj.get("1", "")
                        ts = obj.get("time", "")
                        if ts and isinstance(msg, str):
                            for name_lower, name in agent_names_lower.items():
                                if name_lower in msg.lower():
                                    spawn_times[name] = ts
                    except Exception:
                        pass
    except Exception:
        pass

    return spawn_times


def _estimate_tokens_from_sessions() -> dict:
    """Estimate token usage per agent from session file sizes."""
    sessions_dir = OPENCLAW_DIR / "agents" / "main" / "sessions"
    agent_tokens = {a: {"input": 0, "output": 0} for a in AGENT_IDS}

    # Use session file sizes as proxy for token usage
    try:
        for f in sessions_dir.glob("*.jsonl"):
            size = f.stat().st_size
            # Rough estimate: 4 bytes per token, 60% input / 40% output
            total_tokens = size // 4
            input_t = int(total_tokens * 0.6)
            output_t = int(total_tokens * 0.4)
            agent_tokens["main"]["input"] += input_t
            agent_tokens["main"]["output"] += output_t
    except Exception:
        pass

    # Distribute some tokens to sub-agents based on cron job assignments
    for agent in AGENT_IDS[1:]:
        agent_tokens[agent]["input"] = agent_tokens["main"]["input"] // 10
        agent_tokens[agent]["output"] = agent_tokens["main"]["output"] // 12

    return agent_tokens


# ── API: Agents ────────────────────────────────────────────────────────
@app.get("/api/agents")
async def get_agents():
    config = _load_json(OPENCLAW_CONFIG) or {}
    agents_list = config.get("agents", {}).get("list", [])
    sessions = _get_agent_sessions()
    all_events = _load_agent_events()

    # Parse all session keys for per-agent activity
    agent_activity = _find_agent_in_session_keys(sessions)

    # Detect spawn events from logs
    spawn_times = _detect_spawn_in_logs()

    result = []
    for agent_cfg in agents_list:
        aid = agent_cfg["id"]

        # 1) Check parsed session keys (e.g. "agent:researcher:main")
        activity = agent_activity.get(aid, {})
        updated_at = activity.get("updatedAt", 0)
        origin = activity.get("origin", {})

        # 2) Also check per-agent session directory
        per_agent = _get_per_agent_session_info(aid)
        if per_agent["last_modified"] > updated_at:
            updated_at = per_agent["last_modified"]

        # 3) Fallback: direct session key lookup
        session_key = f"agent:{aid}:main"
        session = sessions.get(session_key, {})
        session_updated = session.get("updatedAt", 0)
        if session_updated > updated_at:
            updated_at = session_updated
            origin = session.get("origin", {})

        last_activity = ""
        status = "offline"
        if updated_at:
            dt = datetime.fromtimestamp(updated_at / 1000)
            last_activity = dt.isoformat()
            diff_minutes = (datetime.now() - dt).total_seconds() / 60
            if diff_minutes < 5:
                status = "active"
            elif diff_minutes < 60:
                status = "idle"

        # 4) Determine last_spawned from log detection
        last_spawned = spawn_times.get(aid, "")

        # 5) Recent events from agent-events.json
        agent_events = [e for e in all_events if e.get("agent") == aid]
        recent_events = agent_events[-5:]
        # Update last_activity from events if more recent
        if agent_events:
            event_ts = agent_events[-1].get("timestamp", "")
            if event_ts and (not last_activity or event_ts > last_activity):
                last_activity = event_ts
                # Re-evaluate status based on event timestamp
                try:
                    evt_dt = datetime.fromisoformat(event_ts)
                    diff_minutes = (datetime.now() - evt_dt).total_seconds() / 60
                    if diff_minutes < 5:
                        status = "active"
                    elif diff_minutes < 60 and status == "offline":
                        status = "idle"
                except Exception:
                    pass

        result.append({
            "id": aid,
            "status": status,
            "color": AGENT_COLORS.get(aid, "#6b7280"),
            "lastActivity": last_activity,
            "lastSpawned": last_spawned,
            "currentTask": origin.get("label", "") or session.get("origin", {}).get("label", ""),
            "workspace": agent_cfg.get("workspace", ""),
            "sessionCount": per_agent["session_count"],
            "recentEvents": recent_events,
        })
    return result


# ── API: Resources ─────────────────────────────────────────────────────
@app.get("/api/resources")
async def get_resources():
    token_data = _estimate_tokens_from_sessions()

    # Count sessions
    sessions_dir = OPENCLAW_DIR / "agents" / "main" / "sessions"
    session_count = len(list(sessions_dir.glob("*.jsonl"))) if sessions_dir.exists() else 0

    # Count memory files
    memory_count = len(list(MEMORY_DIR.glob("*.md"))) if MEMORY_DIR.exists() else 0

    # Cron stats
    cron_data = _load_json(CRON_JOBS_FILE) or {"jobs": []}
    total_crons = len(cron_data["jobs"])
    ok_crons = sum(1 for j in cron_data["jobs"] if j.get("state", {}).get("lastStatus") == "ok")
    failed_crons = total_crons - ok_crons

    # Calculate costs
    total_input = sum(d["input"] for d in token_data.values())
    total_output = sum(d["output"] for d in token_data.values())
    estimated_cost = (total_input / 1_000_000) * INPUT_COST_PER_M + (total_output / 1_000_000) * OUTPUT_COST_PER_M

    return {
        "tokensByAgent": {
            aid: {
                "input": token_data[aid]["input"],
                "output": token_data[aid]["output"],
                "cost": round(
                    (token_data[aid]["input"] / 1_000_000) * INPUT_COST_PER_M
                    + (token_data[aid]["output"] / 1_000_000) * OUTPUT_COST_PER_M,
                    2,
                ),
            }
            for aid in AGENT_IDS
        },
        "totalInput": total_input,
        "totalOutput": total_output,
        "estimatedCost": round(estimated_cost, 2),
        "sessionCount": session_count,
        "memoryFileCount": memory_count,
        "cronStats": {"total": total_crons, "ok": ok_crons, "failed": failed_crons},
    }


# ── API: Crons ─────────────────────────────────────────────────────────
@app.get("/api/crons")
async def get_crons():
    data = _load_json(CRON_JOBS_FILE) or {"jobs": []}
    result = []
    for job in data["jobs"]:
        state = job.get("state", {})
        next_run = ""
        if state.get("nextRunAtMs"):
            next_run = datetime.fromtimestamp(state["nextRunAtMs"] / 1000).isoformat()
        last_run = ""
        if state.get("lastRunAtMs"):
            last_run = datetime.fromtimestamp(state["lastRunAtMs"] / 1000).isoformat()

        result.append({
            "id": job["id"],
            "name": job["name"],
            "description": job.get("description", ""),
            "enabled": job.get("enabled", False),
            "schedule": job.get("schedule", {}).get("expr", ""),
            "timezone": job.get("schedule", {}).get("tz", "UTC"),
            "nextRun": next_run,
            "lastRun": last_run,
            "lastStatus": state.get("lastStatus", "unknown"),
            "lastDurationMs": state.get("lastDurationMs", 0),
            "consecutiveErrors": state.get("consecutiveErrors", 0),
        })
    return result


# ── API: Memory Summary ────────────────────────────────────────────────
@app.get("/api/memory/summary")
async def get_memory_summary():
    if not MEMORY_DIR.exists():
        return {"files": [], "summary": "No memory files found."}

    files = sorted(MEMORY_DIR.glob("*.md"), key=lambda f: f.stat().st_mtime, reverse=True)
    file_list = []
    today_items = []
    project_items = []

    for f in files[:20]:
        content = f.read_text(errors="replace")[:2000]
        mtime = datetime.fromtimestamp(f.stat().st_mtime)
        name = f.stem

        file_list.append({
            "name": name,
            "modified": mtime.isoformat(),
            "sizeBytes": f.stat().st_size,
            "preview": content[:300],
        })

        # Classify
        if date.today().isoformat() in name:
            today_items.append(name)
        elif "project" in content.lower() or "진행" in content:
            project_items.append(name)

    summary_parts = []
    if today_items:
        summary_parts.append(f"오늘 메모리: {', '.join(today_items)}")
    if project_items:
        summary_parts.append(f"프로젝트 관련: {', '.join(project_items[:5])}")

    return {
        "files": file_list,
        "todayFiles": today_items,
        "projectFiles": project_items,
        "summary": " | ".join(summary_parts) if summary_parts else "메모리 파일 분석 완료",
    }


# ── Agent Events helpers ───────────────────────────────────────────────
def _load_agent_events() -> list:
    data = _load_json(AGENT_EVENTS_FILE)
    if isinstance(data, list):
        return data
    return []


def _save_agent_events(events: list):
    AGENT_EVENTS_FILE.write_text(json.dumps(events, ensure_ascii=False, indent=2))


# ── API: Agent Events ─────────────────────────────────────────────────
class AgentEventCreate(BaseModel):
    agent: str
    event: str  # start | checkpoint | complete | error
    message: str


@app.post("/api/agent-events")
async def post_agent_event(payload: AgentEventCreate):
    async with _file_lock:
        events = _load_agent_events()
        entry = {
            "id": str(uuid.uuid4()),
            "agent": payload.agent,
            "event": payload.event,
            "message": payload.message,
            "timestamp": datetime.now().isoformat(),
        }
        events.append(entry)
        # Keep max 500 events
        if len(events) > 500:
            events = events[-500:]
        _save_agent_events(events)
    return entry


@app.get("/api/agent-events")
async def get_agent_events(
    agent: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    events = _load_agent_events()
    if agent:
        events = [e for e in events if e.get("agent") == agent]
    return events[-limit:]


# ── API: Kanban ────────────────────────────────────────────────────────
@app.get("/api/kanban")
async def get_kanban():
    data = _load_json(KANBAN_FILE)
    if not data:
        return {"columns": {}, "cards": {}, "columnOrder": []}
    return data


class KanbanUpdate(BaseModel):
    columns: dict
    cards: dict
    columnOrder: list


@app.put("/api/kanban")
async def put_kanban(payload: KanbanUpdate):
    data = payload.model_dump()

    # Detect cards in "queued" column → auto-spawn + move to "in_progress"
    queued_col = data.get("columns", {}).get("queued")
    in_progress_col = data.get("columns", {}).get("doing")
    spawned_ids = []
    if queued_col and in_progress_col and queued_col.get("cardIds"):
        for card_id in list(queued_col["cardIds"]):
            card = data["cards"].get(card_id)
            if not card:
                continue
            agent = card.get("agent", "builder")
            title = card.get("title", "")
            description = card.get("description", "")
            workdir = card.get("workdir", "")

            # Fire openclaw system event
            event_text = f"Kanban 작업대기: {title} | agent={agent} | workdir={workdir} | desc={description}"
            try:
                subprocess.Popen(
                    ["openclaw", "system", "event", "--text", event_text, "--mode", "now"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception as e:
                logger.warning(f"Failed to spawn via openclaw: {e}")

            # Record agent event
            async with _file_lock:
                events = _load_agent_events()
                events.append({
                    "id": str(uuid.uuid4()),
                    "agent": agent,
                    "event": "start",
                    "message": f"칸반 자동 스폰: {title}",
                    "timestamp": datetime.now().isoformat(),
                })
                if len(events) > 500:
                    events = events[-500:]
                _save_agent_events(events)

            # Set started_at and move to in_progress
            card["started_at"] = datetime.now().isoformat()
            spawned_ids.append(card_id)

        # Move spawned cards from queued to in_progress
        for cid in spawned_ids:
            queued_col["cardIds"].remove(cid)
            in_progress_col["cardIds"].append(cid)

    async with _file_lock:
        KANBAN_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return {"ok": True, "spawned": spawned_ids if queued_col and in_progress_col else []}


# ── API: Telegram Feed ─────────────────────────────────────────────────
@app.get("/api/telegram/feed")
async def get_telegram_feed():
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={"limit": 20, "offset": -20})
            data = resp.json()

        if not data.get("ok"):
            return {"messages": [], "error": "Telegram API error"}

        messages = []
        for update in data.get("result", []):
            msg = update.get("message") or update.get("channel_post", {})
            if not msg:
                continue
            chat = msg.get("chat", {})
            messages.append({
                "id": msg.get("message_id"),
                "text": msg.get("text", ""),
                "date": msg.get("date", 0),
                "chatTitle": chat.get("title", chat.get("first_name", "")),
                "chatId": str(chat.get("id", "")),
                "fromUser": msg.get("from", {}).get("first_name", ""),
            })
        return {"messages": messages[-20:]}
    except Exception as e:
        return {"messages": [], "error": str(e)}


# ── WebSocket: Log Streaming ──────────────────────────────────────────
_SPAWN_KEYWORDS = ["coding-agent", "coding_agent", "spawn", "sub-agent", "delegat"]
_AGENT_NAMES_LOWER = {a.lower(): a for a in AGENT_IDS}


def _detect_spawn_event(line: str) -> dict | None:
    """Check if a log line indicates an agent spawn or activation."""
    line_lower = line.lower()
    for kw in _SPAWN_KEYWORDS:
        if kw in line_lower:
            # Try to identify which agent
            for name_lower, name in _AGENT_NAMES_LOWER.items():
                if name_lower in line_lower and name != "main":
                    try:
                        obj = json.loads(line)
                        ts = obj.get("time", "")
                    except Exception:
                        ts = datetime.now().isoformat()
                    return {
                        "type": "agent_spawn",
                        "agent": name,
                        "timestamp": ts,
                        "message": f"Agent '{name}' spawn detected",
                    }
            # Generic spawn event
            try:
                obj = json.loads(line)
                ts = obj.get("time", "")
            except Exception:
                ts = datetime.now().isoformat()
            return {
                "type": "agent_spawn",
                "agent": "unknown",
                "timestamp": ts,
                "message": "Agent spawn activity detected",
            }
    return None


@app.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket):
    await websocket.accept()

    log_path = _today_log_path()
    if not log_path.exists():
        await websocket.send_json({"type": "info", "message": "No log file for today yet."})

    try:
        # Send last 50 lines first
        if log_path.exists():
            lines = log_path.read_text(errors="replace").strip().split("\n")
            for line in lines[-50:]:
                parsed = _parse_log_line(line)
                if parsed:
                    await websocket.send_json(parsed)

        # Then tail
        last_size = log_path.stat().st_size if log_path.exists() else 0
        while True:
            await asyncio.sleep(2)
            current_path = _today_log_path()
            if not current_path.exists():
                continue
            current_size = current_path.stat().st_size
            if current_size > last_size:
                with open(current_path, "r", errors="replace") as f:
                    f.seek(last_size)
                    new_data = f.read()
                    for line in new_data.strip().split("\n"):
                        parsed = _parse_log_line(line)
                        if parsed:
                            await websocket.send_json(parsed)

                        # Detect and broadcast agent spawn events
                        spawn_event = _detect_spawn_event(line)
                        if spawn_event:
                            await websocket.send_json(spawn_event)
                last_size = current_size
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


# ── Static Files / SPA ─────────────────────────────────────────────────
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve index.html for all non-API routes (SPA)
        file_path = DIST_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")

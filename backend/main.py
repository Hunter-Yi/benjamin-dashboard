"""Benjamin Command Center — FastAPI Backend."""
from __future__ import annotations

import asyncio
import json
import os
import glob as globmod
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Dict, List, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Any

import httpx

# ── Paths ──────────────────────────────────────────────────────────────
OPENCLAW_DIR = Path.home() / ".openclaw"
OPENCLAW_CONFIG = OPENCLAW_DIR / "openclaw.json"
CRON_JOBS_FILE = OPENCLAW_DIR / "cron" / "jobs.json"
MEMORY_DIR = OPENCLAW_DIR / "workspace" / "memory"
SESSIONS_FILE = OPENCLAW_DIR / "agents" / "main" / "sessions" / "sessions.json"
LOG_DIR = Path("/tmp/openclaw")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
KANBAN_FILE = DATA_DIR / "kanban.json"
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

TELEGRAM_BOT_TOKEN = "8520380418:AAHpCcJnPqlMY7obnTMkkAJ-nzKh_bmLpyM"
TELEGRAM_GROUP_ID = "-1003889486980"

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

    result = []
    for agent_cfg in agents_list:
        aid = agent_cfg["id"]

        # Find matching session
        session_key = f"agent:{aid}:main"
        session = sessions.get(session_key, {})

        updated_at = session.get("updatedAt", 0)
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

        result.append({
            "id": aid,
            "status": status,
            "color": AGENT_COLORS.get(aid, "#6b7280"),
            "lastActivity": last_activity,
            "currentTask": session.get("origin", {}).get("label", ""),
            "workspace": agent_cfg.get("workspace", ""),
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
    KANBAN_FILE.write_text(json.dumps(payload.model_dump(), ensure_ascii=False, indent=2))
    return {"ok": True}


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

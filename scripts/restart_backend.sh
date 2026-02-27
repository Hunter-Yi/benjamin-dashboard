#!/bin/zsh
cd /Users/hunters_agent/Projects/benjamin-dashboard
pkill -f "uvicorn backend.main" 2>/dev/null
sleep 1
nohup /Users/hunters_agent/Projects/benjamin-dashboard/backend/.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8766 --reload > /tmp/benjamin-dashboard.log 2>&1 &
echo "Backend restarted, PID: $!"

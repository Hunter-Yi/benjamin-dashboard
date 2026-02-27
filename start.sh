#!/bin/bash
cd ~/Projects/benjamin-dashboard
source backend/.venv/bin/activate
echo "🚀 Benjamin Command Center starting..."
uvicorn backend.main:app --host 0.0.0.0 --port 8766 &
SERVER_PID=$!
echo "✅ Benjamin Command Center running at http://localhost:8766 (PID: $SERVER_PID)"
echo "   Press Ctrl+C to stop"
trap "kill $SERVER_PID 2>/dev/null; echo '🛑 Stopped.'; exit" INT TERM
wait $SERVER_PID

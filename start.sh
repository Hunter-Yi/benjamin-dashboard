#!/bin/bash
cd ~/Projects/benjamin-dashboard
source backend/.venv/bin/activate
echo "🚀 Benjamin Command Center starting..."
uvicorn backend.main:app --host 0.0.0.0 --port 8766 &
SERVER_PID=$!

sleep 2

# Tailscale Funnel (external access)
echo "🌐 Tailscale Funnel 연결 중..."
tailscale funnel --bg 8766 2>/dev/null || true

TAILSCALE_URL=$(tailscale funnel status 2>/dev/null | grep "https://" | grep -v "^#" | awk '{print $1}' | head -1)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🧠 Benjamin Command Center"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Local:    http://localhost:8766"
if [ -n "$TAILSCALE_URL" ]; then
    echo "  External: $TAILSCALE_URL"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

trap "kill $SERVER_PID 2>/dev/null; tailscale funnel --https=443 off 2>/dev/null; echo '🛑 Stopped.'; exit" INT TERM
wait $SERVER_PID

#!/bin/bash
# Start ngrok tunnel to expose Benjamin Command Center externally
PORT=${1:-8766}

# Kill any existing ngrok process
pkill -f "ngrok http" 2>/dev/null

# Start ngrok in background
ngrok http "$PORT" --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!
echo "ngrok started (PID: $NGROK_PID), waiting for tunnel..."

sleep 2

# Fetch the public URL from ngrok's local API
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['tunnels'][0]['public_url'])" 2>/dev/null)

if [ -n "$PUBLIC_URL" ]; then
    echo "Benjamin Command Center is publicly accessible at:"
    echo "  $PUBLIC_URL"
else
    echo "Warning: Could not fetch ngrok public URL. Check http://localhost:4040"
fi

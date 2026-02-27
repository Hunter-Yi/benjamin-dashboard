# Benjamin Command Center

OpenClaw 멀티 에이전트 시스템의 통합 대시보드입니다. 7개 에이전트(main, researcher, builder, tester, integrator, reviewer, optimizer)의 상태, 리소스 사용량, 예약 작업, 칸반 보드, 실시간 로그를 한 곳에서 모니터링합니다.

## Tech Stack

- **Backend:** Python 3 / FastAPI / Uvicorn / WebSocket
- **Frontend:** React 19 / Vite 7 / Tailwind CSS 4 / Recharts
- **Data:** JSON file-based (kanban, cron, sessions)

## Quick Start

```bash
# 1. Backend 설정
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Frontend 설정
cd ../frontend
npm install
npm run build

# 3. 실행
cd ..
./start.sh
# → http://localhost:8766
```

## Development

```bash
# Backend (hot-reload)
source backend/.venv/bin/activate
uvicorn backend.main:app --reload --port 8766

# Frontend (dev server with proxy)
cd frontend
npm run dev
# → http://localhost:5173 (proxied to :8766)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | 에이전트 목록 및 상태 (active/idle/offline) |
| GET | `/api/resources` | 토큰 사용량, 비용, 세션 수, 크론 통계 |
| GET | `/api/crons` | 예약된 크론잡 목록 및 실행 이력 |
| GET | `/api/memory/summary` | 메모리 파일 요약 (최근 20개) |
| GET | `/api/kanban` | 칸반 보드 데이터 조회 |
| PUT | `/api/kanban` | 칸반 보드 상태 업데이트 |
| GET | `/api/telegram/feed` | 텔레그램 피드 (최근 20건) |
| WS | `/ws/logs` | 실시간 로그 스트리밍 |

## Project Structure

```
benjamin-dashboard/
├── backend/
│   ├── main.py          # FastAPI app, all API endpoints
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main layout with tab navigation
│   │   └── components/
│   │       ├── AgentStatus.jsx      # Agent status grid
│   │       ├── ResourceDashboard.jsx # Token/cost charts
│   │       ├── ScheduledTasks.jsx    # Cron jobs & memory
│   │       ├── KanbanBoard.jsx       # Drag-drop kanban
│   │       └── RealtimePanel.jsx     # Log stream & Telegram
│   ├── package.json
│   └── vite.config.js
├── data/
│   └── kanban.json      # Kanban board state
└── start.sh             # One-click launcher
```

## License

MIT

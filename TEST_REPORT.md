# Benjamin Dashboard — Test Report

**1차 테스트 날짜:** 2026-02-27 15:18 KST
**2차 테스트 날짜:** 2026-02-27 16:00 KST
**Server:** http://localhost:8766
**Tester:** tester agent (Claude Code)

---

# 2차 수정사항 검증 (H1 H2 H4 M3 M4 M6)

## 검증 1: .env 파일 및 환경변수 로드 (H1 관련)

| 항목 | 결과 | 상세 |
|------|:----:|------|
| `.env` 파일 존재 | **PASS** | `/Users/hunters_agent/Projects/benjamin-dashboard/.env` (99 bytes) |
| `TELEGRAM_BOT_TOKEN` 정의 | **PASS** | .env에 설정됨 |
| `TELEGRAM_GROUP_ID` 정의 | **PASS** | .env에 설정됨 |
| `from dotenv import load_dotenv` | **PASS** | `backend/main.py:15` |
| `load_dotenv()` 호출 | **PASS** | `backend/main.py:23` — `load_dotenv(Path(__file__).parent.parent / ".env")` |
| `os.environ.get("TELEGRAM_BOT_TOKEN")` | **PASS** | `backend/main.py:39` |
| `os.environ.get("TELEGRAM_GROUP_ID")` | **PASS** | `backend/main.py:40` |
| `python-dotenv` in requirements.txt | **PASS** | `python-dotenv==1.1.0` (line 22) |

**H1 결과: PASS** — 토큰이 코드에 하드코딩되지 않고 .env에서 로드됨

---

## 검증 2: _file_lock 및 asyncio.Lock (H2 관련)

| 항목 | 결과 | 위치 |
|------|:----:|------|
| `import asyncio` | **PASS** | `backend/main.py:4` |
| `_file_lock = asyncio.Lock()` | **PASS** | `backend/main.py:59` |
| `async with _file_lock:` in POST agent-events | **PASS** | `backend/main.py:440` |
| `async with _file_lock:` in PUT kanban (event recording) | **PASS** | `backend/main.py:513` |
| `async with _file_lock:` in PUT kanban (file write) | **PASS** | `backend/main.py:535` |

**H2 결과: PASS** — 파일 동시접근 방지를 위한 asyncio.Lock 적용됨

---

## 검증 3: agent-events cap 로직 (H4 관련)

| 항목 | 결과 | 위치 |
|------|:----:|------|
| POST /api/agent-events에서 500개 제한 | **PASS** | `backend/main.py:451-452` — `if len(events) > 500: events = events[-500:]` |
| PUT /api/kanban 내부 이벤트에서도 500개 제한 | **PASS** | `backend/main.py:522-523` — `if len(events) > 500: events = events[-500:]` |

**H4 결과: PASS** — 두 경로 모두에 agent-events 500개 cap 로직 적용됨

---

## 검증 4: subprocess 실패 로깅 (M3 관련)

| 항목 | 결과 | 위치 |
|------|:----:|------|
| `import logging` | **PASS** | `backend/main.py:6` |
| `logger = logging.getLogger(__name__)` | **PASS** | `backend/main.py:25` |
| `subprocess.Popen` in try/except | **PASS** | `backend/main.py:504-510` |
| `logger.warning(f"Failed to spawn via openclaw: {e}")` | **PASS** | `backend/main.py:510` |

**M3 결과: PASS** — subprocess 실패 시 warning 로그 기록

---

## 검증 5: AgentStatus.jsx 30s polling (M4 관련)

| 항목 | 결과 | 위치 |
|------|:----:|------|
| `fetchAgents` 함수 정의 | **PASS** | `AgentStatus.jsx:47-53` |
| `setInterval(fetchAgents, 30000)` | **PASS** | `AgentStatus.jsx:57` |
| `clearInterval` on cleanup | **PASS** | `AgentStatus.jsx:58` — `return () => clearInterval(interval)` |
| useEffect dependency `[]` (mount only) | **PASS** | `AgentStatus.jsx:59` |

**M4 결과: PASS** — 30초 간격 자동 폴링 + cleanup 적용됨

---

## 검증 6: RealtimePanel.jsx 재연결 로직 (M6 관련)

| 항목 | 결과 | 위치 |
|------|:----:|------|
| `retryDelayRef = useRef(2000)` 초기값 | **PASS** | `RealtimePanel.jsx:45` |
| `ws.onclose` 재연결 호출 | **PASS** | `RealtimePanel.jsx:61-65` |
| exponential backoff `retryDelayRef.current * 2` | **PASS** | `RealtimePanel.jsx:65` |
| 최대 30초 cap `Math.min(..., 30000)` | **PASS** | `RealtimePanel.jsx:65` |
| 성공 시 delay 리셋 `retryDelayRef.current = 2000` | **PASS** | `RealtimePanel.jsx:59` |
| unmounted 체크로 메모리 누수 방지 | **PASS** | `RealtimePanel.jsx:48, 63` |
| cleanup에서 ws.close() | **PASS** | `RealtimePanel.jsx:81` |

**M6 결과: PASS** — WebSocket 재연결 + exponential backoff (2s→30s cap) 적용됨

---

## 검증 7: 서버 재시작 후 API 정상 응답

| Endpoint | HTTP | 결과 | 상세 |
|----------|:----:|:----:|------|
| `GET /api/agents` | 200 | **PASS** | 7 agents, main=active, builder=idle, tester=active |
| `GET /api/agent-events` | 200 | **PASS** | 4 events returned |
| `GET /api/resources` | 200 | **PASS** | tokensByAgent, cronStats(10/6/4), 18 sessions |
| `GET /api/kanban` | 200 | **PASS** | 5 columns, 4 cards |

**서버 테스트 결과: 4/4 PASS**

---

## 검증 8: 프론트엔드 빌드

| 항목 | 결과 |
|------|:----:|
| `npx vite build` 성공 | **PASS** (1.85s) |
| `dist/index.html` 생성 | **PASS** (0.47 KB) |
| `dist/assets/index-*.css` 생성 | **PASS** (23.45 KB) |
| `dist/assets/index-*.js` 생성 | **PASS** (624.24 KB) |

**빌드 결과: PASS**

**Warning:** JS bundle 624 KB (500 KB 권장 초과). code-splitting 고려 필요.

---

## 1차 버그 수정 확인

### BUG (1차에서 발견): `PUT /api/kanban` UnboundLocalError

**원래 문제:** `spawned_ids` 변수가 조건문 내부에서만 정의되어, queued가 비어있으면 UnboundLocalError 발생

**수정 확인:**
- `backend/main.py:487` — `spawned_ids = []` 가 조건문 외부에서 초기화됨 ✓
- return 문에서 `spawned_ids` 안전하게 참조 가능 ✓

**상태: FIXED**

---

## 2차 검증 종합 결과

| 검증 항목 | 이슈 ID | 결과 |
|----------|---------|:----:|
| .env 환경변수 로드 | H1 | **PASS** |
| asyncio.Lock 파일 동시접근 방지 | H2 | **PASS** |
| agent-events 500개 cap (양쪽 경로) | H4 | **PASS** |
| subprocess 실패 로깅 | M3 | **PASS** |
| AgentStatus 30s polling | M4 | **PASS** |
| WebSocket 재연결 + backoff | M6 | **PASS** |
| API 정상 응답 (4개 엔드포인트) | — | **PASS** |
| 프론트엔드 빌드 | — | **PASS** |
| 1차 버그 (UnboundLocalError) 수정 | — | **FIXED** |

### 전체 결과: 8/8 PASS + 1 Bug FIXED

---

# 1차 테스트 기록 (2026-02-27 15:18)

<details>
<summary>1차 테스트 상세 (접기/펼치기)</summary>

## 1. API Regression Tests

| # | Endpoint | Method | HTTP Status | Response Time | Result | Notes |
|---|----------|--------|:-----------:|:-------------:|:------:|-------|
| 1 | `/api/agents` | GET | 200 | 14.7ms | **PASS** | 7 agents returned, all have `recentEvents` and `lastSpawned` fields |
| 2 | `/api/resources` | GET | 200 | 5.0ms | **PASS** | Token estimates, cron stats (10 total, 6 ok, 4 failed), 18 sessions, 18 memory files |
| 3 | `/api/kanban` | GET | 200 | 2.2ms | **PASS** | 5 columns, 5 cards, valid structure with `queued` column |
| 4 | `/api/agent-events` | GET | 200 | 2.0ms | **PASS** | Returns event array, filtering by agent and limit works |

## 2. New Endpoint Tests — 3/3 PASS
## 3. Kanban Auto-Move Test — 5/5 PASS
## 4. Bug Found — UnboundLocalError (now FIXED in 2차)
## 5. Frontend Build — PASS

**1차 결과: 17/17 PASS + 1 Bug**

</details>

---

## Environment

- macOS Darwin 25.3.0
- Python 3.9 (venv at `backend/.venv`)
- FastAPI + Uvicorn
- Vite 7.3.1
- Node.js (for frontend build)
- python-dotenv 1.1.0

# Benjamin Dashboard 코드 리뷰

**리뷰어:** Reviewer Agent
**날짜:** 2026-02-27
**대상 파일:**
- `backend/main.py`
- `frontend/src/components/AgentStatus.jsx`
- `frontend/src/components/KanbanBoard.jsx`
- (추가 참조: `RealtimePanel.jsx`, `ResourceDashboard.jsx`, `ScheduledTasks.jsx`)

---

## 발견된 이슈

### HIGH — 즉시 수정 필요

#### H1. agent-events 500건 cap 미적용 (kanban 자동스폰 경로)
- **위치:** `backend/main.py:504-512`
- **설명:** `POST /api/agent-events` 엔드포인트는 500건 cap을 적용하지만(line 441-443), `PUT /api/kanban`의 자동스폰 로직에서 이벤트를 추가할 때는 cap 없이 `_save_agent_events(events)`를 직접 호출. 칸반 작업대기를 반복 사용하면 **agent-events.json이 무한 증가** 가능.
- **수정:** kanban 자동스폰 경로에도 동일한 500건 cap 로직 적용 필요.

```python
# 현재 (line 504-512): cap 없음
events = _load_agent_events()
events.append({...})
_save_agent_events(events)

# 수정안:
events = _load_agent_events()
events.append({...})
if len(events) > 500:
    events = events[-500:]
_save_agent_events(events)
```

#### H2. 파일 기반 데이터 저장소 경쟁 조건 (Race Condition)
- **위치:** `backend/main.py:419-420`, `502-512`, `523`
- **설명:** `agent-events.json`과 `kanban.json`에 대한 동시 읽기/쓰기 시 데이터 유실 가능. 특히 `put_kanban`에서 이벤트 로드→추가→저장 과정이 atomic하지 않음.
- **수정:** `asyncio.Lock` 또는 파일 잠금 도입, 장기적으로 SQLite 전환 고려.

#### H3. API 인증 부재
- **위치:** 전체 API 엔드포인트
- **설명:** 모든 엔드포인트가 인증 없이 공개. Tailscale funnel로 외부 접근 가능한 상태에서 누구나 칸반 수정, 이벤트 생성, 텔레그램 피드 조회 가능.
- **수정:** 최소한 Bearer 토큰 또는 API Key 기반 인증 미들웨어 추가.

#### H4. Telegram Bot Token 소스코드 하드코딩
- **위치:** `backend/main.py:33-34`
- **설명:** `TELEGRAM_BOT_TOKEN`과 `TELEGRAM_GROUP_ID`가 소스코드에 직접 포함. Git 히스토리에 영구 기록됨.
- **수정:** 환경변수(`os.environ.get(...)`) 또는 `.env` 파일로 이동. `.gitignore`에 `.env` 추가.

---

### MEDIUM — 개선 권장

#### M1. KanbanUpdate 모델 입력 검증 부족
- **위치:** `backend/main.py:468-471`
- **설명:** `columns: dict`, `cards: dict`, `columnOrder: list`로 선언되어 구조 검증 없음. 악의적이거나 잘못된 페이로드로 `kanban.json` 손상 가능.
- **수정:** Pydantic 중첩 모델로 구조 정의 (cardIds: List[str], card fields 등).

#### M2. AgentEventCreate 입력 길이 제한 없음
- **위치:** `backend/main.py:424-428`
- **설명:** `message`, `agent` 필드에 길이 제한 없음. 대용량 페이로드 전송 시 디스크 및 메모리 부담.
- **수정:** `Field(max_length=500)` 등 제약 추가, `event` 필드는 `Literal["start", "checkpoint", "complete", "error"]`로 제한.

#### M3. AgentStatus 자동 갱신 없음
- **위치:** `frontend/src/components/AgentStatus.jsx:47-53`
- **설명:** 컴포넌트 마운트 시 1회만 fetch. 에이전트 상태가 실시간 반영 안 됨.
- **수정:** `setInterval`로 30초마다 polling 또는 WebSocket 이벤트 연동.

#### M4. WebSocket 자동 재연결 없음
- **위치:** `frontend/src/components/RealtimePanel.jsx:46-63`
- **설명:** WS 연결이 끊기면 "연결 끊김" 표시만 하고 재연결 시도 없음. 네트워크 불안정 시 수동 새로고침 필요.
- **수정:** `onclose`에서 exponential backoff로 재연결 로직 추가.

#### M5. 프론트엔드 에러 처리 무시
- **위치:** 다수 컴포넌트 `.catch(() => {})`
- **설명:** `AgentStatus.jsx:51`, `KanbanBoard.jsx:40`, `ResourceDashboard.jsx:20` 등에서 API 실패 시 에러를 무시. 사용자가 문제를 인지할 수 없음.
- **수정:** 에러 상태 표시 UI 추가 (toast 또는 인라인 에러 메시지).

#### M6. subprocess.Popen 명령어 실패 무시
- **위치:** `backend/main.py:494-501`
- **설명:** `openclaw system event` 실행 실패 시 `except Exception: pass`로 완전 무시. 스폰 실패를 알 수 없음.
- **수정:** 최소한 로깅 추가 (`import logging; logger.warning(...)`).

#### M7. 토큰 사용량 추정치 부정확
- **위치:** `backend/main.py:184-207`
- **설명:** 파일 크기 ÷ 4를 토큰 수로, 서브에이전트는 main의 1/10~1/12로 일괄 할당. 실제 사용량과 큰 괴리.
- **수정:** 추정치임을 UI에 명시하거나, OpenClaw API에서 실제 토큰 데이터 가져오기.

---

### LOW — 코드 품질

#### L1. `globmod` 미사용 임포트
- **위치:** `backend/main.py:7`
- **설명:** `import glob as globmod` 선언되었으나 코드 내 사용처 없음.
- **수정:** 삭제.

#### L2. `AGENT_COLORS` 중복 정의
- **위치:** `backend/main.py:37-45`, `KanbanBoard.jsx:6-9`
- **설명:** 동일한 색상 맵이 백엔드와 프론트엔드에 각각 하드코딩. 불일치 위험.
- **수정:** 백엔드 API에서 agents와 함께 색상 정보 제공 (이미 `/api/agents`에서 color 반환 중이므로 프론트엔드 상수 제거 가능).

#### L3. `Loading` 컴포넌트 4회 중복
- **위치:** `AgentStatus.jsx:212-218`, `KanbanBoard.jsx:355-361`, `ResourceDashboard.jsx:106-112`, `ScheduledTasks.jsx:131-137`
- **설명:** 완전히 동일한 로딩 스피너가 4개 파일에 복붙.
- **수정:** `components/Loading.jsx`로 분리하여 공유.

#### L4. 카드 ID 충돌 가능성
- **위치:** `KanbanBoard.jsx:82`
- **설명:** `card-${Date.now()}`로 ID 생성. 동일 밀리초 내 중복 생성 시 충돌.
- **수정:** `crypto.randomUUID()` 또는 카운터 조합 사용.

#### L5. ESC 키 핸들러 cleanup 타이밍
- **위치:** `AgentStatus.jsx:70-74`, `KanbanBoard.jsx:125-129`
- **설명:** `closeModal`이 `useEffect` 의존성에 포함되지 않아 stale closure 가능성. 기능적으로는 문제없으나 React strict mode에서 경고 발생 가능.

---

## 추가 개선 제안 (우선순위)

| 우선순위 | 제안 | 설명 |
|---------|------|------|
| **P0** | agent-events cap 통일 | H1 수정 — 즉시 적용 가능, 1줄 변경 |
| **P0** | Bot token 환경변수 이동 | H4 수정 — 보안 즉시 개선 |
| **P1** | API 인증 추가 | H3 수정 — Bearer token middleware |
| **P1** | 파일 쓰기 잠금 추가 | H2 수정 — asyncio.Lock 적용 |
| **P2** | AgentStatus 자동 갱신 | M3 — 30초 polling 추가 |
| **P2** | WS 자동 재연결 | M4 — exponential backoff |
| **P2** | 에러 UI 표시 | M5 — 사용자 피드백 개선 |
| **P3** | Loading 컴포넌트 통합 | L3 — 코드 중복 제거 |
| **P3** | KanbanUpdate 스키마 강화 | M1 — 데이터 무결성 |
| **P3** | 프론트엔드 AGENT_COLORS 제거 | L2 — API에서 제공하는 color 사용 |

---

## 요약

- **발견된 이슈:** 총 16건 (HIGH 4건, MEDIUM 7건, LOW 5건)
- **무한 증가 문제:** agent-events.json은 POST 엔드포인트 경로에서는 500건 cap이 있으나, **kanban 자동스폰 경로에서 cap 미적용** — 무한 증가 가능 확인됨 (H1)
- **즉시 조치 필요:** H1(events cap), H4(token 환경변수)는 1-2줄 수정으로 즉시 적용 가능
- **전반적 평가:** 기능적으로 잘 동작하는 대시보드이나, 외부 접근이 가능한 환경에서 인증 부재와 토큰 노출이 가장 큰 보안 위험

---
---

# 2차 코드 리뷰 (2026-02-27) — WS broadcast, log parsing, agent status live update

**리뷰어:** Reviewer Agent
**날짜:** 2026-02-27
**커밋:** `2c98237` (fix: WS URL prefix + log parsing + agent status live update via WS broadcast)
**대상 파일:**
- `backend/main.py` — ConnectionManager, WS broadcast, log parsing, agent status
- `frontend/src/components/RealtimePanel.jsx` — WS URL fix
- `frontend/src/components/AgentStatus.jsx` — WS listener

---

## 1차 리뷰 이슈 해결 현황

| 이슈 | 상태 | 확인 내용 |
|------|------|----------|
| **H1** agent-events 500건 cap | **해결** | `put_kanban` 경로에 `if len(events) > 500: events = events[-500:]` 추가 (line 546-547) |
| **H2** 파일 경쟁 조건 | **해결** | `_file_lock` (asyncio.Lock)이 kanban 자동스폰 (line 537)과 kanban 저장 (line 559) 경로 모두 적용 |
| **H3** API 인증 부재 | **미해결** | 여전히 전체 엔드포인트 인증 없음 |
| **H4** Bot token 하드코딩 | **해결** | `os.environ.get()` 사용으로 전환 (line 39-40) |
| **M3** AgentStatus 자동 갱신 없음 | **해결** | `setInterval(fetchAgents, 30000)` 추가 (AgentStatus.jsx:57) + WS 이벤트 연동 (line 61-79) |
| **M4** WS 자동 재연결 없음 | **해결** | RealtimePanel.jsx에 exponential backoff 재연결 구현 (line 62-66, 2s→30s max) |
| **M6** subprocess 실패 무시 | **해결** | `logger.warning()` 로깅 추가 (line 533-534) |
| **M1** KanbanUpdate 검증 | **미해결** | 여전히 `dict` 타입 |
| **M2** AgentEventCreate 길이 제한 | **미해결** | 여전히 제한 없음 |
| **M5** 프론트엔드 에러 무시 | **미해결** | AgentStatus.jsx:51 여전히 `.catch(() => {})` |
| **M7** 토큰 추정치 부정확 | **미해결** | 동일 로직 유지 |
| **L1** globmod 미사용 | **미해결** | line 8에 여전히 존재 |
| **L2** AGENT_COLORS 중복 | **미해결** | 동일 |
| **L3** Loading 중복 | **미해결** | 동일 |
| **L4** 카드 ID 충돌 | **미해결** | 동일 |
| **L5** ESC 핸들러 closure | **미해결** | 동일 |

**요약: 16건 중 7건 해결 (H1, H2, H4, M3, M4, M6 + 신규 ConnectionManager/broadcast 기능)**

---

## 이번 수정에서 발견된 신규 이슈

### HIGH — 즉시 수정 필요

#### H5. ws_logs 초기 로드 시 전체 파일을 메모리에 적재
- **위치:** `backend/main.py:645`
- **설명:** `log_path.read_text()` 로 오늘의 로그 파일 전체를 메모리에 읽은 뒤 `.split("\n")[-50:]` 으로 마지막 50줄만 사용. OpenClaw가 활발히 동작하면 하루 로그가 수십 MB에 달할 수 있으며, **WS 연결마다** 전체 파일을 메모리에 로드.
- **영향:** 동시 WS 클라이언트 N개 × 로그파일 크기만큼 메모리 소비. OOM 가능.
- **수정안:**
```python
# deque를 이용한 tail 방식
from collections import deque
with open(log_path, "r", errors="replace") as f:
    last_lines = deque(f, maxlen=50)
for line in last_lines:
    parsed = _parse_log_line(line)
    if parsed:
        await websocket.send_json(parsed)
```

---

### MEDIUM — 개선 권장

#### M8. 동일 페이지에서 WebSocket 이중 연결
- **위치:** `AgentStatus.jsx:64`, `RealtimePanel.jsx:54`
- **설명:** AgentStatus와 RealtimePanel이 각각 독립적으로 `/ws/logs` WebSocket 연결을 생성. 같은 페이지에서 두 탭이 모두 렌더링되면 **동일 클라이언트가 2개의 WS 연결**을 유지. 서버 ConnectionManager에 중복 등록.
- **수정:** 앱 레벨에서 단일 WS 연결을 공유하는 context/hook 도입. 예: `useWebSocket()` custom hook.

#### M9. _detect_spawn_in_logs() 매 API 호출마다 전체 로그 스캔
- **위치:** `backend/main.py:165-207`, `get_agents()` line 248에서 호출
- **설명:** `/api/agents` 호출 시 매번 오늘의 전체 로그 파일을 줄 단위로 스캔. 30초 polling × 클라이언트 수만큼 반복. 로그 파일이 커질수록 응답 지연.
- **수정:** 결과를 메모리에 캐시하고 TTL(예: 30초) 적용, 또는 마지막 스캔 위치를 기록하여 incremental scan.

#### M10. spawn_event가 개별 클라이언트에만 전송 (broadcast 미사용)
- **위치:** `backend/main.py:671`
- **설명:** `ws_logs`에서 감지한 `spawn_event`를 `await websocket.send_json(spawn_event)` 로 해당 WS 연결에만 전송. `agent_event` (line 477)는 `manager.broadcast()`로 전체 전송하는 것과 불일치. 다른 클라이언트가 spawn 이벤트를 못 받음.
- **수정:** `await manager.broadcast(spawn_event)` 사용, 또는 spawn 감지를 별도 백그라운드 태스크로 분리.

---

### LOW — 코드 품질

#### L6. AgentStatus WS 재연결 backoff 미적용
- **위치:** `AgentStatus.jsx:75`
- **설명:** `setTimeout(connect, 3000)` 으로 고정 3초 재연결. RealtimePanel은 exponential backoff(2s→30s) 사용. 동일 패턴 적용 권장.

#### L7. ws_logs 일반 예외 핸들러에 로깅 없음
- **위치:** `backend/main.py:675-676`
- **설명:** `except Exception: manager.disconnect(websocket)` — WS 연결이 비정상 종료될 때 에러 원인이 기록되지 않아 디버깅 어려움.
- **수정:** `except Exception as e: logger.error(f"ws_logs error: {e}"); manager.disconnect(websocket)`

#### L8. ConnectionManager.active 리스트 무한 증가 가능성
- **위치:** `backend/main.py:57-71`
- **설명:** WS 연결이 정상 close 없이 끊어지면 (네트워크 단절 등) `disconnect()`가 호출되지 않을 수 있음. `broadcast()` 시 실패한 연결은 제거되지만, broadcast가 호출되지 않는 기간에는 stale 연결이 쌓임.
- **수정:** 주기적 heartbeat/ping 또는 최대 연결 수 제한 고려.

---

## 코드 품질 총평 (이번 수정)

### 잘된 점
1. **ConnectionManager 패턴** — broadcast 시 `list(self.active)` 복사 후 순회하여 iteration 중 mutation 방지. 전송 실패 시 자동 제거. 깔끔한 구현.
2. **WS URL 구성 수정** — `import.meta.env.BASE_URL` 활용하여 reverse proxy (Tailscale funnel `/benjamin` prefix) 환경에서 정상 동작하도록 수정. 정확한 접근.
3. **agent_event broadcast → AgentStatus 실시간 갱신** — POST /api/agent-events 시 WS broadcast → AgentStatus가 감지하여 자동 re-fetch. 의도대로 동작하며 사용자 경험 대폭 개선.
4. **Exponential backoff 재연결** — RealtimePanel에서 2s~30s backoff. 네트워크 불안정 시 서버 부하 방지.
5. **1차 리뷰 HIGH 이슈 대부분 해결** — H1, H2, H4 해결으로 데이터 안정성과 보안 개선.

### 주의 필요
1. **메모리 효율** — H5 (전체 로그 파일 메모리 로드)가 가장 시급. 운영 환경에서 문제 발생 가능.
2. **중복 WS 연결** — M8. 클라이언트당 2개 연결은 리소스 낭비.
3. **API 인증** — H3 여전히 미해결. 외부 접근 가능 환경에서 가장 큰 리스크.

---

## 추가 개선 제안 (업데이트)

| 우선순위 | 제안 | 상태 |
|---------|------|------|
| **P0** | agent-events cap 통일 (H1) | **해결** |
| **P0** | Bot token 환경변수 (H4) | **해결** |
| **P0** | ws_logs 메모리 최적화 (H5) | **신규 — 즉시 수정 필요** |
| **P1** | API 인증 추가 (H3) | 미해결 |
| **P1** | WS 단일 연결 공유 (M8) | 신규 |
| **P1** | 로그 스캔 캐시 (M9) | 신규 |
| **P2** | spawn broadcast 수정 (M10) | 신규 |
| **P2** | 에러 UI 표시 (M5) | 미해결 |
| **P3** | AgentStatus backoff (L6) | 신규 |
| **P3** | ws_logs 예외 로깅 (L7) | 신규 |

---

## 전체 요약

- **1차 리뷰 대비:** 16건 중 7건 해결. 특히 HIGH 이슈 3/4 해결 (H1, H2, H4).
- **이번 수정 신규:** 7건 추가 (HIGH 1, MEDIUM 3, LOW 3)
- **미해결 총계:** HIGH 2건 (H3 인증, H5 메모리), MEDIUM 6건, LOW 8건
- **가장 시급:** H5 (ws_logs 메모리), H3 (API 인증)
- **전반 평가:** WS broadcast와 실시간 업데이트 구현이 잘 되었으나, 메모리 효율과 인증이 운영 안정성의 핵심 과제로 남아 있음

---
---

# 4차 코드 리뷰 (2026-02-27) — H1 cap, H3 인증, H5 ws 메모리, M1/M2 검증, M5 에러처리, M8 WS 이중연결, sessions_spawn 감지

**리뷰어:** Reviewer Agent
**날짜:** 2026-02-27
**대상 파일:**
- `backend/main.py` — APIKeyMiddleware, KanbanUpdate validator, AgentEventCreate max_length, ws_logs 메모리, sessions_spawn 감지
- `frontend/src/components/AgentStatus.jsx` — fetchAgents 에러 처리
- `frontend/src/components/RealtimePanel.jsx` — WS 연결 상태

---

## 3차 리뷰 이슈 해결 현황

| 이슈 | 상태 | 확인 내용 |
|------|------|----------|
| **H3** API 인증 부재 | **부분 해결** | `APIKeyMiddleware` 추가됨. 단, `API_KEY` 미설정 시 `if API_KEY: app.add_middleware(...)` 조건으로 미들웨어 자체 비활성화. 환경변수 미설정 상태에서 여전히 무인증. |
| **H5** ws_logs 메모리 전체 로드 | **부분 개선** | 초기 전송 줄 수를 50 → 100으로 늘렸으나, `log_path.read_text()` 로 전체 파일 읽기 방식은 동일. 근본 문제 미해결. |
| **M1** KanbanUpdate 검증 | **해결** | `@field_validator` 추가, cards title 200자 제한 적용됨. |
| **M2** AgentEventCreate 길이 제한 | **해결** | `agent: Field(max_length=50)`, `event: Field(max_length=50)`, `message: Field(max_length=1000)` 적용. |
| **M5** 프론트엔드 에러 무시 | **부분 해결** | `AgentStatus.jsx` fetchAgents에 `.catch((e) => console.error("fetchAgents error:", e))` 추가됨. 그러나 사용자에게 노출되는 UI 에러 표시는 여전히 없음. |
| **M8** WS 이중연결 | **미해결** | `AgentStatus.jsx`와 `RealtimePanel.jsx`가 각각 `/ws/logs`에 독립 연결. 동일 클라이언트에서 2개 WS 연결 유지 중. |
| **M9** 로그 스캔 캐시 없음 | **미해결** | `_detect_spawn_in_logs()` 여전히 매 `/api/agents` 호출마다 전체 로그 파일 스캔. |
| **M10** spawn_event broadcast 미사용 | **미해결** | `ws_logs`에서 spawn_event를 `await websocket.send_json(spawn_event)` 로 해당 WS에만 전송. broadcast 미사용. |
| **L1** globmod 미사용 import | **미해결** | `import glob as globmod` line 8에 여전히 존재. |
| **L6** AgentStatus WS 고정 3초 재연결 | **미해결** | `setTimeout(connect, 3000)` 고정. |
| **L7** ws_logs 예외 로깅 없음 | **미해결** | `except Exception: manager.disconnect(websocket)` — 에러 원인 기록 없음. |

---

## sessions_spawn 세션 감지 로직 검증

`_find_agent_in_session_keys()` 함수 분석:

```python
# sessions_spawn 키 패턴: "agent:main:subagent:UUID"
elif "subagent" in key or "isolated" in key:
    label = session.get("label", "")
    if label and label in AGENT_IDS and label != "main":
        aid = label
```

**판정: 조건부 동작**

- ✅ `agent:main:subagent:UUID` 형태의 키는 `"subagent" in key` 조건으로 감지됨
- ✅ `label` 필드에서 에이전트명 추출 로직 올바름
- ⚠️ `"isolated" in key` 패턴은 현재 OpenClaw sessions_spawn에서 생성되지 않을 가능성 있음 — 불필요한 조건이거나 향후 확장용
- ⚠️ sessions.json의 `label` 필드가 실제로 "builder", "reviewer" 등으로 채워지는지는 OpenClaw 내부 구현에 의존. AGENTS.md에서 `label="builder"` 명시적 지정 필요.
- ❌ 감지 후 `agent_activity` 딕셔너리에 `updatedAt` 기준으로 최신 세션만 유지하므로, 여러 subagent UUID가 동일 label을 가질 때 가장 최근 것만 반영됨 (의도된 동작으로 보임)

**권고:** subagent 스폰 시 `label` 필드를 반드시 AGENT_IDS 중 하나로 명시할 것 (현재 AGENTS.md 규칙에서는 label="builder" 등 명시 중 — 올바름).

---

## H3 인증 미들웨어 상세 분석

```python
API_KEY = os.environ.get("API_KEY", "")

if API_KEY:  # ← API_KEY가 비어있으면 미들웨어 등록 안 됨
    app.add_middleware(APIKeyMiddleware)
```

**현재 동작:**
- `API_KEY` 환경변수 설정 시: localhost(127.0.0.1, ::1) 제외한 외부 요청 모두 인증 요구 → ✅ 올바른 설계
- `API_KEY` 미설정 시: 미들웨어 비활성화 → 완전 무인증 운영 → ❌ 위험

**권고:** `.env` 파일에 `API_KEY` 필수 설정. 운영 가이드에 명시 필요. 또는 `API_KEY` 기본값을 무작위 생성하여 필수화.

---

## 이번 수정에서 발견된 신규 이슈

### MEDIUM

#### M11. ws_logs spawn_event가 broadcast 대신 개별 전송
- **위치:** `backend/main.py` ws_logs 핸들러
- **설명:** `spawn_event` 감지 시 `await websocket.send_json(spawn_event)`로 해당 WS 연결에만 전송. `agent_event`는 `manager.broadcast()`를 통해 모든 클라이언트에 전달되는 것과 불일치. RealtimePanel이 spawn을 보더라도 AgentStatus 다른 탭/클라이언트는 spawn 이벤트를 받지 못함.
- **수정:** `await manager.broadcast(spawn_event)` 사용.

---

## 이번 수정 잘된 점

1. **APIKeyMiddleware localhost 예외** — 개발/로컬 환경에서 불편함 없이 localhost 접근 허용하면서 외부 접근은 인증 요구. 실용적 설계.
2. **KanbanUpdate @field_validator** — 카드 title 200자 제한, 타입 검증 추가. 데이터 무결성 향상.
3. **AgentEventCreate max_length** — 페이로드 크기 제한으로 디스크 남용 방지.
4. **ws_logs 실시간 tail 방식** — `f.seek(last_size)`로 파일 증분만 읽는 tail 로직은 효율적. 초기 로드만 개선하면 충분.

---

## 전체 미해결 이슈 현황 (4차 기준)

| 이슈 | 심각도 | 내용 |
|------|--------|------|
| H3 (부분) | HIGH | API_KEY 미설정 시 인증 완전 비활성화 — .env 설정 필수화 |
| H5 | HIGH | ws_logs 초기 로드 시 전체 로그 파일 메모리 적재 |
| M8 | MEDIUM | AgentStatus + RealtimePanel WS 이중 연결 |
| M9 | MEDIUM | _detect_spawn_in_logs() 캐시 없음 |
| M10/M11 | MEDIUM | spawn_event broadcast 미사용 |
| M7 | MEDIUM | 토큰 추정치 부정확 (UI 미표시) |
| L1 | LOW | globmod 미사용 import |
| L2 | LOW | AGENT_COLORS 중복 정의 |
| L3 | LOW | Loading 컴포넌트 중복 |
| L4 | LOW | 카드 ID 충돌 가능성 |
| L6 | LOW | AgentStatus WS 고정 3초 재연결 |
| L7 | LOW | ws_logs 예외 미로깅 |

---

## 4차 요약

- **3차 대비 해결:** M1(KanbanUpdate 검증), M2(AgentEventCreate 길이 제한) 완전 해결. H3/M5 부분 해결.
- **여전히 시급:** H5 (ws_logs 메모리) — 운영 중 OOM 위험. H3 partial — API_KEY `.env` 설정 필수화 권고.
- **신규 발견:** M11 (spawn broadcast 미사용) — 1건.
- **sessions_spawn 감지:** `"subagent" in key` + `label` 필드 추출 로직 유효. 단 `label` 명시적 지정이 전제조건.
- **전반 평가:** 코드 품질과 안정성이 1차 리뷰 대비 크게 향상됨. 잔여 HIGH 이슈는 H5 메모리 최적화 1건과 API_KEY 운영 정책 1건. 단기간 내 해결 가능한 수준.

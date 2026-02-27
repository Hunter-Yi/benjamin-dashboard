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

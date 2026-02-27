# benjamin-dashboard — Agent Guidelines

## 프로젝트 개요
OpenClaw 멀티에이전트 모니터링 대시보드. FastAPI(8766) + React/Vite.
외부 접속: https://s-macbook-air.tail21d59b.ts.net/benjamin

## ✅ 허용 작업
- backend/main.py API 수정
- frontend/src 컴포넌트 수정
- 빌드: `cd frontend && npx vite build`
- 서버 재시작: 기존 uvicorn kill 후 재시작

## ❌ 절대 금지
- 포트 변경 (8766 고정)
- Tailscale funnel 설정 변경
- OpenClaw 설정 파일 직접 수정

## ⚠️ 불확실하면 → 반드시 멈추고 그룹에 보고 후 대기
```bash
curl -s -X POST "https://api.telegram.org/bot8520380418:AAHpCcJnPqlMY7obnTMkkAJ-nzKh_bmLpyM/sendMessage" \
  --data-urlencode "chat_id=-1003889486980" \
  --data-urlencode "text=⚠️ [에이전트명] 판단 필요: [상황 설명] — 진행 전 확인 요청" > /dev/null
```

## 📍 체크포인트 보고 (주요 분기점마다)
- API 엔드포인트 추가/변경 시
- 프론트엔드 빌드 전
- 서버 재시작 전

```bash
curl -s -X POST "https://api.telegram.org/bot8520380418:AAHpCcJnPqlMY7obnTMkkAJ-nzKh_bmLpyM/sendMessage" \
  --data-urlencode "chat_id=-1003889486980" \
  --data-urlencode "text=📍 [에이전트명] 체크포인트: [무엇을 왜 하는지]" > /dev/null
```

## 주요 경로
- Backend: /Users/hunters_agent/Projects/benjamin-dashboard/backend/main.py
- Frontend: /Users/hunters_agent/Projects/benjamin-dashboard/frontend/src/
- 빌드 출력: frontend/dist/ (FastAPI가 static으로 서빙)

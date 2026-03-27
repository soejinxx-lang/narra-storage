# ⚙️ NARRA Storage — 백엔드 API + Worker

> 웹소설 플랫폼의 핵심 백엔드 — API 서버, 번역 파이프라인, 댓글봇, 결제 webhook

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL |
| Language | TypeScript 5, Python 3.11 |
| AI | GPT-4o, GPT-4o-mini, GPT-5 (Azure + OpenAI) |
| Storage | AWS S3 |
| TTS | Google Cloud Text-to-Speech |
| SMS | CoolSMS |
| 배포 | Railway (API + Worker 분리) |

---

## Railway 서비스 구조

```
Railway Project
├── narra-storage          # Next.js API 서버
│   └── npm run start
├── diligent-enthusiasm    # Worker (번역 + 댓글봇 + SMS)
│   └── npm run worker
└── PostgreSQL             # 데이터베이스
```

---

## API 라우트

```
app/api/
├── auth/                       # 인증
│   ├── signup/                 #   회원가입
│   ├── login/                  #   로그인
│   ├── me/                     #   현재 사용자 정보
│   └── ...
│
├── novels/                     # 작품
│   ├── [id]/                   #   작품 CRUD
│   │   ├── episodes/           #     에피소드 목록
│   │   │   └── [ep]/           #       에피소드 상세
│   │   │       └── retry/      #         번역 재시도
│   │   └── entities/           #     고유명사 관리
│   │       └── [entityId]/     #       개별 고유명사
│   └── ...
│
├── episodes/                   # 에피소드 관련
│
├── community/                  # 댓글 시스템
│   └── ...                     #   CRUD, 좋아요, 신고
│
├── authors/                    # 작가 프로필
│   └── [id]/                   #   작가 상세
│
├── user/                       # 사용자
│   └── plan/                   #   구독 플랜 조회
│
├── audio/                      # TTS 오디오 생성
│
├── webhook/                    # 외부 webhook
│   ├── route.ts                #   LemonSqueezy (레거시)
│   └── gumroad/                #   Gumroad (현재 사용)
│       └── route.ts            #     구독 이벤트 처리
│
├── subscription-event/         # 구독 이벤트 처리
│
├── test-results/               # E2E 테스트 결과 수신
│
└── dev/                        # 개발/운영 도구 (15개)
    ├── run-comment-bot/        #   댓글봇 실행
    ├── run-comment-bot-intl/   #   국제 댓글봇 실행
    ├── trigger-comment-bot/    #   댓글봇 트리거
    ├── comment-stats/          #   댓글 통계
    ├── recent-comments/        #   최근 댓글 조회
    ├── compare-models/         #   LLM 모델 비교
    ├── llm-status/             #   LLM 상태 확인
    ├── check-schema/           #   DB 스키마 확인
    ├── prune-comments/         #   댓글 정리
    ├── prune-novels/           #   작품 정리
    ├── reset-comments/         #   댓글 초기화
    ├── reset-all-bot-comments/ #   봇 댓글 전체 초기화
    ├── backfill-all-comments/  #   댓글 백필
    ├── fix-comment-dates/      #   댓글 날짜 수정
    └── reveal-scheduled-comments/ # 예약 댓글 공개
```

---

## Worker 시스템

### worker/index.ts (46KB, 핵심)

Worker는 **3가지 역할**을 동시에 수행:

#### 1. 번역 큐 처리
```
매 1초 → DB에서 PENDING 작업 폴링
  → 상태를 RUNNING으로 원자적 변경
  → 텍스트 2500자 단위 청크 분할
  → 각 청크를 Python 파이프라인으로 번역
  → 3회 재시도 (Exponential backoff)
  → 완료: DONE + translated_text 저장
  → 실패: FAILED + error_message 저장
  → Dead Worker 복구: 15분 이상 RUNNING → 재시작
```

#### 2. 댓글봇
```
8단계 파이프라인:
  1. 에피소드 컨텍스트 수집
  2. 상황 기반 프롬프트 구성
  3. GPT 호출 (Azure 5회 + OpenAI 1회)
  4. GPT-5 큐레이터 품질 관리
  5. 후처리 (마침표/쉼표 제거, 물음표→단정 변환)
  6. 댓글 스케줄링 (시간 분산)
  7. 갭 채우기 전략 (자연스러운 성장)
  8. DB 저장

한국어 + 국제 버전 별도 운영
```

#### 3. SMS Digest
```
4시간 간격 (00:00, 06:00, 12:00, 18:00 KST):
  - 번역 상태 요약
  - 댓글봇 통계
  - 에러 알림
  → CoolSMS API로 SMS 발송
```

### Worker 파일 구조
```
worker/
├── index.ts              # 메인 루프 (번역 + 댓글봇 + SMS)
├── translate.ts          # Python 브리지 (spawn, HTTP 없음)
├── chunker.ts            # 텍스트 2500자 분할
├── translate_cli.py      # Python CLI 번역 스크립트
├── audio-worker.ts       # TTS Worker (⚠️ 현재 미작동)
├── requirements.txt      # Python 의존성
└── translation_core/     # Python 번역 파이프라인
    ├── pipeline.py       #   3단계 번역 (Translation→Editing→Advanced)
    ├── openai_client.py  #   Azure/OpenAI 클라이언트 (자동 전환)
    ├── entity_store.py   #   고유명사 DB
    ├── placeholder.py    #   고유명사 Placeholder 치환/복원
    ├── entity_detector.py #  고유명사 추출
    └── paragraph_editor_*.py  # 언어별 문단 리듬 (9개 파일)
```

---

## 번역 파이프라인

### 3+1단계 구조
```
[STAGE 1] Translation (GPT-4o)
  → 충실한 1차 번역
  ↓
[STAGE 2] Editing (GPT-4o-mini) ← 비용 최적화
  → 문법/자연스러움 교정
  ↓
[STAGE 3] Advanced Editing (GPT-4o, EN/JA/ZH만)
  → 고급 문학적 편집
  ↓
[언어별 문단 리듬] (GPT-4o-mini) ← 비용 최적화
  → 각 언어 특성에 맞는 문체 조정
```

### 고유명사 보호 (Placeholder 방식)
```python
# 1. 치환: 번역 전 고유명사를 placeholder로 변경
"김독자는 멸망한 세계에서 살아남았다"
→ "__ENTITY_abc123__는 __ENTITY_def456__에서 살아남았다"

# 2. 번역: GPT가 placeholder는 건드리지 않고 번역
→ "__ENTITY_abc123__ survived in __ENTITY_def456__"

# 3. 복원: 사람이 확정한 번역으로 교체
→ "Kim Dokja survived in Three Ways to Survive in a Destroyed World"
```

### 비용 현황
- STAGE 2, 리듬 조정: GPT-4o-mini (저렴)
- STAGE 1, 3: GPT-4o (고품질)
- 월 예상: ~$1,050

---

## Gumroad Webhook

### 처리 이벤트
| 이벤트 | 처리 |
|--------|------|
| `sale` | 신규 구독 → 플랜 활성화 |
| `subscription_updated` | 플랜 변경 반영 |
| `subscription_cancelled` | 기간 종료 시 다운그레이드 |
| `subscription_ended` | 즉시 다운그레이드 |
| `refunded`, `dispute` | 즉시 다운그레이드 |

### 안정성
- **Idempotency**: `processed_webhooks` 테이블로 중복 방지
- **이중 매칭**: `custom_fields[user_id]` → `email` fallback
- **Stale 방지**: `last_event_at` 타임스탬프 비교

---

## 데이터베이스 스키마

### 핵심 테이블

| 테이블 | 역할 | 주요 컬럼 |
|--------|------|-----------|
| `novels` | 작품 | id, title, description, cover_url, source_language |
| `episodes` | 에피소드 | id, novel_id, ep, title, content, views |
| `episode_translations` | 번역 | episode_id, language, translated_text, status, is_public |
| `entities` | 고유명사 | novel_id, source_text, translations(JSONB), locked |
| `users` | 사용자 | id, username, password_hash, name, email |
| `comments` | 댓글 | episode_id, user_id, parent_id, content, likes |
| `user_plans` | 구독 | user_id, plan_type, gumroad_subscription_id |
| `processed_webhooks` | 웹훅 중복방지 | event_id, processed_at |
| `test_results` | E2E 결과 | suite, status, duration, metadata |

### 번역 상태 (status)
```
PENDING → RUNNING → DONE
                  → FAILED (error_message 포함)
```

---

## 환경변수

### 필수
```bash
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2
AWS_S3_BUCKET=...
GUMROAD_SELLER_ID=...
```

### Azure OpenAI (선택)
```bash
USE_AZURE_OPENAI=true
AZURE_OPENAI_ENDPOINT=https://...openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=...
```

### SMS Digest (선택)
```bash
COOLSMS_API_KEY=...
COOLSMS_API_SECRET=...
COOLSMS_SENDER=010XXXXXXXX
SMS_RECIPIENT=010XXXXXXXX
```

---

## 개발

```bash
npm install

# API 서버
npm run dev

# Worker (번역 + 댓글봇 + SMS)
npm run worker

# Admin 계정 생성
npm run create-admin

# Audio Worker
npm run audio-worker
```

---

## 배포

- **플랫폼**: Railway
- **서비스 2개**: API (`narra-storage`) + Worker (`diligent-enthusiasm`)
- **방식**: `git push` → 자동 배포
- **환경변수**: Railway UI에서 관리

> ⚠️ 로컬에 API 키 저장 금지. 커밋/배포는 사용자가 직접 수행.

---

## 알려진 제약사항

| 문제 | 상태 | 설명 |
|------|------|------|
| 고유명사 파일 저장 | ⚠️ | 로컬 `data/entities/` → Railway 재배포 시 휘발 (DB 마이그레이션 필요) |
| TTS Audio Worker | ❌ | 현재 미작동 |
| Railway 타임아웃 | ✅ 해결 | Pipeline을 Worker에 병합하여 HTTP 제거 |

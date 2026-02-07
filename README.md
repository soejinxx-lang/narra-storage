# NARRA Storage - 백엔드 + 번역 파이프라인

> ⚠️ **규칙은 최상위 [narra/README.md](../README.md) 참고**

---

## 프로젝트 개요

웹소설 번역 플랫폼의 백엔드 시스템입니다.

**핵심 역할**:
- Next.js API (작품/에피소드/인증/댓글 등)
- PostgreSQL 데이터베이스
- Python 번역 파이프라인 (GPT-4o-mini)
- TypeScript Worker (번역 작업 큐 처리)

---

## 시스템 전체 흐름

```
[Admin UI] → 번역 시작 버튼 클릭
     ↓
[Storage API] → episode_translations에 status='PENDING' 레코드 생성
     ↓
[Worker (index.ts)] → 1초마다 PENDING 작업 폴링
     ↓
[Python (pipeline.py)] → 번역 실행 (spawn, HTTP 없음)
     ↓
[DB] → status='DONE' + translated_text 저장
```

### Worker (index.ts) 역할
- **1초마다** DB에서 PENDING 작업 폴링
- 작업 발견하면 **RUNNING으로 상태 변경** (다른 Worker랑 충돌 방지)
- 텍스트를 **2500자 단위**로 청크 분할
- 각 청크를 **Python 번역 파이프라인**으로 전달
- 완료 시 **DONE**, 실패 시 **FAILED + 에러 메시지**
- **15분 이상 RUNNING**인 작업은 죽은 Worker로 판단 → 다시 처리

### Python 브리지 (translate.ts) 역할
- TypeScript에서 **Python 프로세스 spawn**
- `translate_cli.py` 스크립트 실행
- stdout으로 번역 결과 받아옴
- **HTTP 없음** - 직접 프로세스 호출

---

## 프로젝트 구조

```
narra-storage/
├── app/
│   ├── api/                    # Next.js API Routes
│   │   ├── auth/               # 로그인/세션
│   │   ├── novels/             # 작품 CRUD
│   │   ├── episodes/           # 에피소드 관리
│   │   ├── audio/              # TTS 오디오 생성 (⚠️ 현재 미작동)
│   │   └── community/          # 댓글 시스템
│   ├── db.ts                   # PostgreSQL 연결 + 스키마
│   └── page.tsx                # 메인 페이지
│
├── worker/
│   ├── index.ts                # Worker 메인 루프
│   ├── translate.ts            # Python 브리지
│   ├── chunker.ts              # 텍스트 분할
│   ├── audio-worker.ts         # TTS Worker (⚠️ 현재 미작동)
│   └── translation_core/       # Python 번역 파이프라인
│       ├── pipeline.py         # 3단계 번역 파이프라인
│       ├── openai_client.py    # Azure/OpenAI 클라이언트
│       ├── entity_store.py     # 고유명사 DB
│       ├── placeholder.py      # 고유명사 보호
│       ├── entity_detector.py  # 고유명사 추출
│       └── paragraph_editor_*.py  # 언어별 문단 리듬 (9개)
│
├── data/
│   └── entities/               # 작품별 고유명사 JSON (로컬)
│
├── migrations/                 # DB 마이그레이션
├── scripts/                    # 유틸리티 스크립트
└── public/                     # 정적 파일
```

---

## Railway 배포 구조

### 2개 서비스로 분리
- **narra-storage**: Next.js API + PostgreSQL
- **diligent-enthusiasm (Worker)**: 번역 Worker (별도 컨테이너)

### 환경변수 (두 서비스 모두 설정 필요)

**필수**:
```bash
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2
AWS_S3_BUCKET=...
```

**Azure OpenAI 사용 시**:
```bash
USE_AZURE_OPENAI=true
AZURE_OPENAI_ENDPOINT=https://narraproject-resource.openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=...
```

---

## 번역 파이프라인

### 3단계 번역 구조
```
[STAGE 1] Translation (GPT-4o)
  ↓
[STAGE 2] Editing (GPT-4o-mini) ← 비용 최적화
  ↓
[STAGE 3] Advanced Editing (GPT-4o, EN/JA/ZH만)
  ↓
[언어별 문단 리듬 조정] (GPT-4o-mini) ← 비용 최적화
```

### 고유명사 처리
```python
# 1. Placeholder 치환
"김독자는 멸망한 세계에서 살아남았다"
→ "__ENTITY_abc123__는 __ENTITY_def456__에서 살아남았다"

# 2. GPT 번역 (placeholder 절대 변경 금지)
→ "__ENTITY_abc123__ survived in __ENTITY_def456__"

# 3. Placeholder 복원 (사람이 확정한 번역)
→ "Kim Dokja survived in Three Ways to Survive in a Destroyed World"
```

### 지원 언어 (9개)
- `ko` (Korean)
- `en` (English)
- `ja` (Japanese)
- `zh` (Chinese Simplified)
- `es` (Spanish)
- `fr` (French)
- `de` (German)
- `pt` (Portuguese)
- `id` (Indonesian)

---

## 데이터베이스 스키마

### 핵심 테이블

**novels** (작품)
- `id`, `title`, `description`, `cover_url`
- `source_language` (원문 언어, 기본값: 'ko')

**episodes** (에피소드)
- `id`, `novel_id`, `ep`, `title`, `content`
- `views`, `ghost_pool`

**episode_translations** (번역 작업)
- `id`, `episode_id`, `language`
- `translated_text`, `status` (PENDING/PROCESSING/DONE/FAILED)
- `error_message`, `pipeline_version`
- `is_public` (퍼블릭 노출 제어)

**entities** (고유명사)
- `id`, `novel_id`, `source_text`
- `translations` (JSONB, 다국어 번역)
- `locked`, `category`, `notes`

**users** (사용자)
- `id`, `username`, `password_hash`, `name`

**comments** (댓글)
- `id`, `episode_id`, `user_id`, `parent_id`
- `content`, `likes`, `is_hidden`

---

## 개발

```bash
# API 서버 실행
npm run dev

# Worker 실행
npm run worker

# Admin 계정 생성
npm run create-admin

# Audio Worker 실행
npm run audio-worker
```

---

## 배포

**Railway 자동 배포**:
1. `git push` → Railway 자동 감지
2. narra-storage, Worker 모두 자동 재배포
3. 환경변수는 Railway UI에서만 관리

**⚠️ 주의**:
- 로컬에 API 키 저장 금지
- 커밋/배포는 사용자가 직접 수행

---

## Worker 동작 방식

### 번역 작업 흐름
```
1. DB에서 PENDING 작업 폴링 (1초 간격)
2. 작업 발견 시 상태를 RUNNING으로 변경 (Atomic)
3. 텍스트를 2500자 단위로 분할 (Chunking)
4. 각 Chunk를 순차적으로 번역
   - Python 프로세스 호출 (HTTP ❌)
   - 3회 재시도 (Exponential backoff)
5. 언어별 문단 리듬 조정
6. DB에 저장 (status=DONE)
```

### Dead Worker 복구
- 15분 이상 RUNNING 상태인 작업 자동 재시작

---

## 비용 최적화 (2026-02-01)

### 변경 사항
- **STAGE 2 (Editing)**: GPT-4o → GPT-4o-mini
- **STAGE 5 (Rhythm)**: GPT-4o → GPT-4o-mini

### 효과
- 비용 절감: 월 $1,500 → $1,050 (약 30%)
- 품질 유지: STAGE 1, 3은 여전히 GPT-4o 사용

---

## 알려진 제약사항

### 1. 고유명사 저장
- **현재**: 로컬 파일 (`data/entities/*.json`)
- **문제**: Railway 재배포 시 휘발성
- **해결**: PostgreSQL `entities` 테이블로 마이그레이션 필요

### 2. Railway 타임아웃
- **문제**: HTTP 요청 10초 제한
- **해결**: Pipeline을 Worker에 병합 (HTTP 제거)

---

## 최근 변경 사항

### 2026-02-03
- README 전체 재작성
- 프로젝트 구조 문서화

### 2026-02-02
- Azure OpenAI 전환 지원 (`openai_client.py`)

### 2026-02-01
- 비용 최적화: STAGE 2, 5를 GPT-4o-mini로 변경
- 조회수 시스템 단순화 (Ghost Pool 제거)
- View Count API 수정 (narra-web 프록시 추가)

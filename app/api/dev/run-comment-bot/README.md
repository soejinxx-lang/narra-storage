# 댓글봇 시스템 (Comment Bot)

> AI 기반 다국어 웹소설 댓글 자동 생성 시스템

## 아키텍처 개요

```
Worker (tsx)
├── 한국어 → ko-engine.ts (단건 생성, 방식 C)
└── 다국어  → intl engine.ts (7-Stage Pipeline)
    └── 언어팩: en.ts / ja.ts / ko.ts / zh.ts / es.ts
```

---

## 1. 한국어 엔진 (`ko-engine.ts`)

### 파이프라인

```
에피소드 본문(6000자) → GPT 단건생성 × N회 병렬
→ deduplicateComments → judgeComments(하위 30% 제거)
→ sanitizeCommentContent → DB insert
```

### 핵심 설계

| 항목 | 설정 |
|---|---|
| 생성 방식 | 단건 1개씩 (방식 C) |
| context 길이 | 앞 2000자 + 뒤 4000자 = 6000자 |
| temperature | 0.7 / 0.8 / 0.9 / 1.0 / 1.1 순환 |
| concurrency | 5 (rate limit 방지) |
| SCENE_SEEDS | 10종 (distribution collapse 방지) |

### 품질 필터 (3단계)

1. **`isEmptyExclamation`** — "와 미쳤다", "대박", "ㄷㄷ" 등 빈 감탄사 제거
2. **`deduplicateComments`** — 정규화 후 중복 제거 (LLM 없이)
3. **`judgeComments`** — LLM-as-Judge 배치 1회, 하위 30% 제거
   - temperature 0.1 (일관성)
   - `/\d+/g` regex 파싱 (JSON 불안정 회피)
   - 50% 안전장치 (과필터 시 전량 통과)

### sanitizeCommentContent

```
따옴표 제거 → 코드블록 제거 → 라벨 접두어 제거 → JSON fragment 감지 → 길이 검사
```

---

## 2. 다국어 엔진 (`engine.ts`)

### 7-Stage Pipeline

```
1. Event Extraction (GPT) — 에피소드에서 5~8개 핵심 장면 추출
1.5. Genre-based Persona Selection — 장르별 페르소나 가중치
2. Reader Profiles — 30 페르소나 배분
3. Scene Context 구성
4. GPT 호출 (call1~5, 페르소나 그룹별)
5. parseComments + dedup + judge
6. Timing/Nickname 배정
7. DB insert
```

### 페르소나 그룹 (30명, 5그룹)

| 그룹 | Call | 역할 | 예시 |
|---|---|---|---|
| Immersed (A1~A8) | call1 | 침착 몰입 | Empathy Reader, Action Junkie |
| Overreactor (B1~B7) | call2 | 과격 반응 | Hype Beast, Chaos Screamer |
| Chaos (C1~C5) | call3 | 트롤/오독 | Misreader, Sarcasm Lord |
| Analyst (D1~D5) | call4 | 분석 | Foreshadow Hunter, Trope Spotter |
| Casual (E1~E5) | call4 | 캐주얼 | TFTC Bot, One-Word Wonder |

### 언어팩 구조 (`LanguagePack`)

| 필드 | 용도 |
|---|---|
| `buildCall1~5Prompt` | 그룹별 프롬프트 생성 |
| `personas` | 30 페르소나 정의 |
| `templates` | few-shot 예시 풀 |
| `humanize` | 후처리 (오타, 슬랭) |
| `curateScoring` | AI DNA 감지 점수 |
| `stripLabel` | 라벨 제거 |

---

## 3. Worker 통합 (`worker/index.ts`)

### 언어별 라우팅

```typescript
if (lang === 'ko') → runKoreanCommentBot (ko-engine.ts)
else               → runCommentBotIntl (engine.ts + 언어팩)
```

### 언어 비율

```
ko: 65% (60~70% 범위)
en: 17%
ja: 10%
zh: 5%
es: 3%
```

jitter ±8%로 에피소드마다 변동.

---

## 4. GPT 호출 설정

| 항목 | 값 |
|---|---|
| deployment | `gpt-4omini` |
| apiVersion | `AZURE_OPENAI_API_VERSION` or `2024-10-01-preview` |
| env 미설정 시 | `return ''` (throw 아님) |
| HTTP 에러 | 로그 + `return ''` |

---

## 5. 주요 변경 이력

| 날짜 | 태그 | 내용 |
|---|---|---|
| ~3주 전 | `comment-bot-final` | 한국어 봇 안정 버전 |
| 2026-03-10 | `ko-bot-restored-0310` | ko-engine 분리, 방식 C, Judge, sanitize 강화 |

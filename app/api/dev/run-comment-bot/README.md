# Comment Bot System — 완전 문서

> **최종 태그**: `한국어시스템완전한완성` (2026-02-16)
> **파일**: `narra-storage/app/api/dev/run-comment-bot/route.ts` (~3050줄)

---

## 0. 전체 거시 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    Comment Bot API                          │
│  POST /api/dev/run-comment-bot                              │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. 입력 처리                                          │ │
│  │     novelId, episodeId, totalCount, deep, etc.         │ │
│  └────────────────────┬───────────────────────────────────┘ │
│                       ▼                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  2. 장르 분석                                          │ │
│  │     DB genre → getGenreWeights() → { fantasy: 0.5 }   │ │
│  │     DB genre → getGenreCategory() → "fantasy"          │ │
│  └────────────────────┬───────────────────────────────────┘ │
│                       ▼                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  3. 댓글 생성 (70/20/10 비율)                          │ │
│  │                                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ 딥컨텍스트   │  │ 중간밀도     │  │ 템플릿       │ │ │
│  │  │ 70%          │  │ 20%          │  │ 10%          │ │ │
│  │  │ 7-Stage      │  │ call5        │  │ fallback     │ │ │
│  │  │ Pipeline     │  │ 7~18자       │  │              │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └────────────────────┬───────────────────────────────────┘ │
│                       ▼                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  4. 봇 계정 생성 + 댓글 DB 삽입                        │ │
│  │     닉네임 풀 → 유저 생성 → 댓글 삽입 → 타임스탬프     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 70/20/10 비율 시스템

각 댓글을 할당할 때 확률적으로 풀을 선택한다:

```typescript
const roll = Math.random();
if (roll < 0.70 && deepComments.length > 0) {
    content = deepComments.pop()!;        // 딥컨텍스트 (70%)
} else if (roll < 0.90 && midDensityPool.length > 0) {
    content = midDensityPool.pop()!;      // 중간밀도 (20%)
} else {
    // 템플릿 (10%) 또는 fallback
}
```

### 딥컨텍스트 (70%)
- 7-Stage Pipeline 거쳐 생성
- 페르소나 기반 인지 분리
- 장면 기반 구체적 반응
- 예: `"소월이 검 뽑는 순간 소름 돋았다ㅋㅋ"`

### 중간밀도 (20%)
- call5에서 생성 (7~18자)
- 장면 언급하되 분석 안 함
- 예: `"여기서 각성하네ㅋㅋ"`, `"이 장면 소름"`, `"드디어 만났다ㅠ"`

### 템플릿 (10%)
- GPT 없이 정적 풀에서 선택
- 극저밀도 반응
- 예: `"ㅋㅋㅋ"`, `"ㄷㄷ"`, `"대박"`, `"ㅇㅈ"`
- (현재 풀 소진 시 deep/mid로 fallback)

---

## 2. 딥컨텍스트 7-Stage Pipeline

`generateDeepContextComments()` 함수 내부 구조:

### Stage 1: Event Extraction
```
에피소드 본문 (최대 2000자) → GPT
→ { events: StoryEvent[], dominantEmotion: string }
```
- 5~7개 핵심 사건 추출
- 지배 감정 1개 판별 (긴장/슬픔/분노/웃김/소름/설렘/허탈/감동)

### Stage 1.5: Genre-based Persona Selection
```
DB genre data → getGenreWeights() → { fantasy: 0.5, romance: 0.5 }
→ selectPersonasForGenre(weights, count=8)
→ [A1, A4, B1, C1, D1, E1, A3, C4]  (8명)
```
- **Largest Remainder Method**로 슬롯 배분
- chaos 최소 1명, casual 최소 1명 강제

### Stage 2: Reader Profile Generation
```
events + personas + dominantEmotion → generateReaderProfiles()
→ ReaderProfile[] (attentionSpan, memoryNoise, emotionalIntensity, bandwagonTarget...)
```

### Stage 3: Info Restriction (View Building)
```
profiles → buildReaderView(events, profile)
→ "주인공이 검을 휘두르자 적이 쓰러졌다" (필터링 + 과장)
```

### Stage 4: 5-Call Cognitive Separation

| call | callGroup | 대상 | 설명 |
|------|-----------|------|------|
| call1 | immersed | 몰입형 (A그룹) | 감정이입, 분위기, 서사 |
| call2 | overreactor | 감정폭발 (C그룹) | ㅋㅋ, ㅠㅠ, 대문자 |
| call3 | chaos | 냉소/오독 (D+E5) | 🔒 보호 영역 |
| call4 | casual | 밈/드립 (E그룹) | 가벼운 반응 |
| call5 | — | 중간밀도 | 7~18자, 분석 없음 |

**프롬프트 구조 예시 (call1):**
```
한국 웹소설 모바일 앱. 방금 읽고 바로 폰으로 치는 댓글.
[장르: 판타지 | 한국어 댓글 스타일] ...

[1번 독자: 감정강도 8/10]
기억: 주인공이 검을 휘둘렀다
사고 초점: 캐릭터의 표정, 대사, 행동 하나에 꽂혀서 거기만 본다
말투: ~미쳤다, ~좋음으로 끊음
어미: ~미쳤다, ~좋음, ~좋다, ~진짜
```

### Stage 5: Herd Effect
- 20% 댓글에 "나도", "ㄹㅇ", "와 진짜" 추가

### Stage 6: Emotion Amplification
- 15% 댓글 대문자 변환
- 12% ㅋㅋ/ㅠㅠ 추가

### Stage 7: GPT-5 Curator
- AI 티 나는 댓글 필터링 (소유격 과다, 추상어, 해설 톤, 설명형)
- chaos comments 보호 (1~2개만 랜덤 위치 삽입)

**반환값:**
```typescript
{ comments: string[], midComments: string[], detectedTags: string[] }
```

---

## 3. 페르소나 시스템 (30명)

### PERSONA_POOL

| 그룹 | ID | 이름 | baseType | callGroup | 사고 초점 |
|------|-----|------|----------|-----------|----------|
| **A. 몰입형 (8)** | | | | | |
| | A1 | 감정이입러 | immersed | immersed | 캐릭터 표정/대사/행동 |
| | A2 | 분위기충 | immersed | immersed | 공간감/색감/연출 |
| | A3 | 커플러 | immersed | immersed | 두 캐릭터 거리감/눈빛 |
| | A4 | 전투몰입러 | immersed | immersed | 전투 동작/역전 |
| | A5 | 서사충 | immersed | immersed | 성장 궤적/서사 흐름 |
| | A6 | 공포체험러 | immersed | immersed | 무서운 장면/불안 |
| | A7 | 감동충 | immersed | immersed | 캐릭터가 힘들어하는 순간 |
| | A8 | 시대감성러 | immersed | immersed | 시대 배경/운명의 무게 |
| **B. 분석형 (7)** | | | | | |
| | B1 | 복선추적러 | analyst | immersed | 떡밥/구조적 반복 |
| | B2 | 세계관분석충 | analyst | immersed | 세계관 규칙/정합성 |
| | B3 | 추리광 | analyst | immersed | 범인/시간선 추리 |
| | B4 | 설정감시자 | analyst | immersed | 물리/마법 규칙 모순 |
| | B5 | 고증충 | analyst | immersed | 역사적 고증 |
| | B6 | 메타분석러 | analyst | immersed | 작가 의도/연출 구조 |
| | B7 | 회귀규칙충 | analyst | immersed | 전생/현생 비교 |
| **C. 반응형 (5)** | | | | | |
| | C1 | 감정폭발러 | overreactor | overreactor | 가장 자극적 장면 |
| | C2 | 사이다중독자 | overreactor | overreactor | 통쾌함/역전 |
| | C3 | 웃음폭발러 | overreactor | overreactor | 웃긴 대사/아이러니 |
| | C4 | 공감충 | overreactor | overreactor | 자기 경험과 연결 |
| | C5 | 단어투척러 | overreactor | overreactor | 인상적 단어 1개만 |
| **D. 냉소형 (5)** | | | | | |
| | D1 | 전개비꼼러 | troll | chaos | 느린 전개/반복 |
| | D2 | 클리셰헌터 | troll | chaos | 뻔한 패턴/기시감 |
| | D3 | 파워밸런스충 | troll | chaos | 파워 인플레/밸런스 |
| | D4 | 작가비판러 | troll | chaos | 구성력/대사 퀄리티 |
| | D5 | 공포비꼼러 | troll | chaos | 공포 클리셰 비꼼 |
| **E. 밈/드립형 (5)** | | | | | |
| | E1 | 게임드립러 | lurker | casual | 게임 메커니즘으로 번역 |
| | E2 | 밈장인 | lurker | casual | 다른 장르/밈 비유 |
| | E3 | 연애드립러 | lurker | casual | 연애 요소 드립 |
| | E4 | 역사드립러 | lurker | casual | 역사→현대 감각 |
| | E5 | 오독러 | misreader | chaos | 잘못 읽고 확신 |

### PersonaDef 속성
```typescript
interface PersonaDef {
    id: string;           // 'A1', 'B2' 등
    name: string;         // '감정이입러', '복선추적러' 등
    baseType: ReaderType; // 'immersed' | 'analyst' | 'overreactor' | 'troll' | 'lurker' | 'misreader'
    callGroup: string;    // 'immersed' | 'overreactor' | 'chaos' | 'casual'
    tone: string;         // 말투 규칙
    style: string;        // 행동 패턴
    endings: string[];    // 어미/조각 (조합용)
    cognitiveFocus: string; // 사고 초점 — 이 독자가 집착하는 대상
}
```

---

## 4. 장르 시스템

### 4.1 GENRE_CATEGORY_MAP (57개 하위장르 → 12개 카테고리)
```
Admin 하위장르          →  상위 카테고리
─────────────────────────────────────
High Fantasy            →  fantasy
Dark Fantasy            →  fantasy
Urban Fantasy           →  fantasy
GameLit / LitRPG        →  game-fantasy
Cultivation             →  game-fantasy
Murim                   →  murim
Contemporary Romance    →  romance
CEO / Billionaire       →  romance
Supernatural Horror     →  horror
Cosmic Horror           →  horror
Space Opera             →  scifi
Cyberpunk               →  scifi
Wuxia / Xianxia         →  murim
Isekai                  →  regression
Regression              →  regression
...
```

### 4.2 getGenreWeights()
```typescript
// Input: "High Fantasy,Romantic Fantasy" (DB에서)
// Output: { fantasy: 0.5, romance: 0.5 }
// 하위장르 개수 비율로 가중치 산출
```

### 4.3 GENRE_PERSONA_MAP (장르별 사용 가능 페르소나)
```typescript
{
    'fantasy':       ['A1','A2','A4','A5','A7','B1','B2','B6','C1','C5','D1','D2','D3','E1','E2','E5'],
    'game-fantasy':  ['A1','A4','A5','B1','B2','B6','C1','C2','C5','D1','D2','D3','E1','E2','E5'],
    'murim':         ['A1','A4','A5','B1','B2','C1','C2','C5','D1','D3','E1','E2','E5'],
    'romance':       ['A1','A3','A7','B1','B6','C1','C4','C5','D1','D2','D4','E2','E3','E5'],
    'horror':        ['A1','A2','A6','C1','C5','D1','D5','E2','E5'],
    'historical':    ['A2','A5','A8','B1','B5','B6','C5','D1','D4','E4','E5'],
    'regression':    ['A4','A5','B1','B7','C2','C5','D1','D2','D3','E1','E2','E5'],
    ...
}
```

### 4.4 GENRE_HINTS (12 장르 × 5 언어)
```typescript
GENRE_HINTS[genre][language]: string
// 예: GENRE_HINTS['fantasy']['ko']
// "[장르: 판타지 | 한국어 댓글 스타일]
//  - 짧은 문장 (5-15자)
//  - '복선', '설정', '세계관', '각성' 자주 사용
//  ..."
```

---

## 5. 메인 핸들러 흐름 (POST 처리)

```
1. 입력 파싱 (novelId, episodeId, totalCount, deep, etc.)
2. 기존 댓글 삭제 (해당 에피소드 봇 댓글)
3. DB에서 장르 조회 → genreWeights, genreCategory
4. 에피소드 본문 조회
5. generateDeepContextComments() 호출 (반복 최대 6회)
   → deepComments[] + midDensityPool[] + sceneTags[]
6. 봇 계정 생성 루프:
   a. 닉네임 선택 (중복 방지)
   b. 유저 계정 생성 (username: bot_timestamp_i)
   c. 각 봇이 1~3개 댓글 작성 (15% 확률로 2~3개)
   d. 70/20/10 비율로 댓글 풀 선택
   e. humanize() 후처리
   f. 5% 확률로 답글 (기존 댓글에)
   g. 랜덤 타임스탬프 부여
7. 결과 반환
```

### 닉네임 풀
- `pickNickname()`: 한국 웹소설 독자 닉네임 풀에서 랜덤 선택
- 기존 에피소드 댓글 닉과 중복 방지

### 타이밍
- 봇 내 댓글 간격: 5분~3시간
- `randomTimestamp()`: 에피소드 게시 후 현실적 시간 분포

---

## 6. 품질 제어 시스템

### 6.1 중간밀도 품질 필터 (midDensityQualityScore)
```typescript
// 길이 7~18자 벗어나면 -4
// "것 같다", "느껴졌다" → -3
// 마침표 끝 → -2
// 존댓말 → -2
// 메타 단어 (각성, 복선, 설정) → -1
// 장르 톤 보너스: ㅠ(로판)+1, ㅋㅋ(게임판타지)+1
// threshold: score >= 6
```

### 6.2 GPT-5 큐레이터 (curateWithGPT5)
```typescript
// AI 티 감점:
// - 소유격 과다 ("마음의 변화가") → -15
// - 추상명사 (관계, 심리, 마음...) → 개당 -10
// - 해설 톤 (묘사, 인상적, 여운...) → 개당 -12
// - 설명형 종결 → -10
// - 쉼표 → 개당 -15
// - 감정 설명형 (것 같다, 느껴졌...) → -20
```

### 6.3 humanize() 후처리
- 마침표 제거, 쉼표→자연스러운 연결, ㅋ/ㅠ 정규화 등

### 6.4 chaos 보호
- call3 결과는 `chaosComments[]`로 분리
- 큐레이터에 안 넣고, 최종 결과에 1~2개만 랜덤 삽입
- 40% 확률로 0개, 50% 확률로 1개, 10% 확률로 2개

---

## 7. 핵심 함수 목록

| 함수 | 위치 | 역할 |
|------|------|------|
| `getGenreWeights()` | ~L248 | DB 장르 → 가중치 맵 |
| `getGenreCategory()` | ~L195 | DB 장르 → 단일 카테고리 (legacy) |
| `selectPersonasForGenre()` | ~L938 | 가중치 → 페르소나 8명 선택 |
| `generateReaderProfiles()` | ~L1091 | 페르소나 → ReaderProfile 생성 |
| `buildReaderView()` | ~L1170 | 이벤트 → 독자 시점 문장 |
| `extractEvents()` | ~L1290 | 본문 → 사건 추출 (GPT) |
| `generateDeepContextComments()` | ~L1354 | 7-Stage 메인 파이프라인 |
| `curateWithGPT5()` | ~L1670 | 품질 필터링 |
| `callAzureGPT()` | ~L1260 | Azure OpenAI 호출 래퍼 |
| `humanize()` | ~L2800 | 후처리 |
| `pickNickname()` | ~L2750 | 닉네임 선택 |
| `randomTimestamp()` | ~L2780 | 타임스탬프 생성 |

---

## 8. API 사용법

### 엔드포인트
```
POST /api/dev/run-comment-bot
```

### 요청
```json
{
    "novelId": "novel-1770910615867",
    "episodeId": "ep-123",
    "totalCount": 30,
    "deep": true,
    "sceneCommentRatio": 40
}
```

### 응답
```json
{
    "ok": true,
    "inserted": 30,
    "cached": 0,
    "deepCount": 21,
    "templateCount": 9
}
```

---

## 9. 디버깅 가이드

### ❌ "로맨스 댓글만 나온다"
1. DB에 장르 저장 안 됨 → `genreWeights = {}` → Admin에서 장르 재저장
2. `GENRE_CATEGORY_MAP`에 해당 장르명 없음 → 매핑 추가
3. 소설이 로판인데 `fantasy`로만 태그됨 → `romance_fantasy`로 변경
4. GPT 자체 편향 → 두 캐릭터 상호작용 = 로맨스로 해석하는 경향

### ❌ "댓글에 '반응:' 라벨 포함"
- `parseComments`의 `stripLabel`에 해당 라벨 패턴 없음
- 장르 키워드 추가 필요

### ❌ "ㅠㅠ가 너무 많다"
- 장르 힌트 미적용 → 로그에서 `📖 Genre hint applied` 확인
- 장르 힌트 없으면 GPT 디폴트 = 감정 위주 = ㅠㅠ

### ❌ "댓글이 전부 비슷하다"
- 한 call에 너무 많은 페르소나 → GPT 평균화
- count=8이 적절 (15 이상은 수렴 위험)

---

## 10. Git 태그 이력

| 태그 | 내용 |
|------|------|
| `here` | 초기 안전 지점 |
| `before-30persona` | 30페르소나 변경 직전 |
| `한국어시스템완전한완성` | **현재** — 70/20/10 비율 시스템 완성 |

---

## 11. 전체 수정 이력

### 2026-02-15 ~ 02-16

1. **장르 매핑 갭 수정**
   - `GENRE_CATEGORY_MAP` 57개 Admin 장르 전부 동기화
   - `sci-fi` → `scifi` 키 통일

2. **장르 힌트 주입 (핵심 버그)**
   - `GENRE_HINTS` 정의만 있고 프롬프트에 안 들어갔음
   - call1/2/3/4 모두에 `${genreHint}` 삽입
   - `sourceLanguage` 파라미터 추가

3. **라벨 릭 방지**
   - `parseComments` fallback 경로에도 `stripLabel` 적용
   - 장르 키워드 라벨 제거 (각성, 서사, 전투, 액션, 심쿵, 케미...)

4. **중간밀도 call5 추가**
   - 7~18자 짧은 댓글 전용 프롬프트
   - `midDensityQualityScore`로 품질 필터링

5. **70/20/10 비율 시스템**
   - 딥컨텍스트 70%, 중간밀도 20%, 템플릿 10%
   - `midComments`를 `generateDeepContextComments` 반환값에 분리
   - 메인 핸들러에서 확률 기반 풀 선택

---

## 12. 알려진 제약

1. **중복 댓글**: 6회 배치 시 동일 페르소나 재사용 → 유사 댓글 가능
2. **GPT 학습 편향**: 장르 힌트 없으면 로맨스/감정 편중
3. **장르 태그 의존**: DB에 장르 없으면 default pool → 범용 댓글
4. **수렴 위험**: 한 call에 15명 이상 넣으면 GPT 평균화

---

## 13. 향후 개선 방향

1. **중복 방지**: 생성된 댓글 히스토리를 프롬프트에 포함
2. **언어별 페르소나**: 중국어·일본어 독자 특성 반영
3. **실시간 트렌드**: 최신 밈·드립 주기적 업데이트
4. **A/B 테스팅**: 비율 on/off 비교 실험
5. **감정 다양성**: ㅠㅠ 사용 확률 동적 조정
6. **페르소나 출력 제약 (constraint)**: 각 페르소나에 언어 습관 강제 (검토 완료, 미구현)

---

## 14. 참고 자료

- **코드**: `narra-storage/app/api/dev/run-comment-bot/route.ts`
- **Admin 장르**: `업로드용 웹사이트/app/novel/[id]/page.tsx` (GENRE_CATEGORIES)
- **DB 스키마**: `novels.genre`, `novels.genre_taxonomy`
- **컨트롤러**: `comment-bot-controller.html` (브라우저 UI)

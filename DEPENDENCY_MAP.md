# Module Dependency Map

Last updated: 2026-03-02

## narra-storage: 공유 모듈 의존성

### db.ts (`app/db.ts`)
> DB커넥션 풀 관리. `initDb()`는 idempotent.

```
db.ts
├── app/api/novels/route.ts              (GET, POST)
├── app/api/novels/[id]/route.ts         (GET, DELETE, PATCH)
├── app/api/novels/[id]/cover/route.ts   (POST)
├── app/api/novels/[id]/episodes/route.ts         (GET, POST)
├── app/api/novels/[id]/episodes/[ep]/route.ts    (GET, POST, DELETE)
├── app/api/novels/[id]/episodes/[ep]/retry/route.ts       (POST)
├── app/api/novels/[id]/episodes/[ep]/translate-all/route.ts  (POST)
├── app/api/novels/[id]/episodes/translations-summary/route.ts (GET)
├── app/api/novels/[id]/entities/route.ts          (GET, POST)
├── app/api/novels/[id]/entities/[entityId]/route.ts (DELETE)
├── app/api/user/novels/route.ts         (GET)
├── app/api/authors/route.ts             (GET)
├── app/api/authors/[id]/route.ts        (GET, PUT)
├── app/api/dev/prune-novels/route.ts    (POST)
├── app/api/dev/run-comment-bot/route.ts (POST)
├── app/api/dev/run-comment-bot-intl/engine.ts
└── worker/index.ts                      (polling loop)
```

### requireAuth.ts (`lib/requireAuth.ts`)
> 인증 미들웨어. `requireAuth`, `requireOwnerOrAdmin`, `consumeNovelQuota`, `consumeTranslationQuota`

```
requireAuth.ts
├── app/api/novels/route.ts              (POST — requireAuth)
├── app/api/novels/[id]/route.ts         (DELETE, PATCH — requireOwnerOrAdmin)
├── app/api/novels/[id]/cover/route.ts   (POST — requireOwnerOrAdmin)
├── app/api/novels/[id]/episodes/route.ts         (POST — requireOwnerOrAdmin)
├── app/api/novels/[id]/episodes/[ep]/route.ts    (POST, DELETE — requireOwnerOrAdmin)
├── app/api/novels/[id]/episodes/[ep]/retry/route.ts       (POST — requireOwnerOrAdmin)
├── app/api/novels/[id]/episodes/[ep]/translate-all/route.ts  (POST — requireOwnerOrAdmin)
├── app/api/novels/[id]/entities/route.ts          (POST — requireOwnerOrAdmin)
├── app/api/novels/[id]/entities/[entityId]/route.ts (DELETE — requireOwnerOrAdmin)
├── app/api/user/novels/route.ts         (GET — requireAuth)
└── worker/index.ts                      (refundTranslationQuota)
```

⚠️ **주의**: `requireOwnerOrAdmin` 내부에서 `db.query` 호출 → `initDb()` 반드시 선행

### auth.ts (`lib/auth.ts`)
> 토큰 파싱, admin 판별. `isAdmin`, `getUserIdFromToken`, `SYSTEM_ADMIN_ID`

```
auth.ts
├── app/api/novels/route.ts              (GET, POST — isAdmin)
├── app/api/novels/[id]/route.ts         (GET — isAdmin)
├── app/api/novels/[id]/episodes/[ep]/retry/route.ts    (POST — isAdmin)
├── app/api/novels/[id]/episodes/[ep]/translate-all/route.ts (POST — isAdmin)
├── app/api/authors/route.ts             (GET — isAdmin)
├── app/api/authors/[id]/route.ts        (PUT — getUserIdFromToken, isAdmin)
└── lib/requireAuth.ts                   (requireOwnerOrAdmin — isAdmin 내부 호출)
```

### validation.ts (`lib/validation.ts`)
> 입력 길이/형식 검증. `validateFields`, `LIMITS`

```
validation.ts
├── app/api/novels/route.ts       (POST)
└── app/api/novels/[id]/route.ts  (PATCH)
```

### bodyLimit.ts (`lib/bodyLimit.ts`)
> 요청 바디 크기 제한. `checkBodySize`

```
bodyLimit.ts
└── app/api/novels/route.ts  (POST)
```

---

## narra-admin: 공유 모듈 의존성

### storageFetch.ts (`lib/server/storageFetch.ts`)
> Storage API 호출 헬퍼. ADMIN_API_KEY 자동 주입, server-only.

```
storageFetch.ts
├── app/api/novels/route.ts       (GET, POST, DELETE)
├── app/api/novels/[id]/route.ts  (DELETE)
├── app/api/authors/route.ts      (GET)
├── app/api/novels/[id]/episodes/route.ts        (GET, POST)
├── app/api/novels/[id]/episodes/[ep]/route.ts   (GET, POST, DELETE)
└── app/api/novels/[id]/entities/route.ts        (GET, POST, DELETE)
```

### config.ts (`lib/config.ts`)
> `STORAGE_BASE` URL 설정.

```
config.ts
└── lib/server/storageFetch.ts  (내부 사용)
```

⚠️ storageFetch 통일 후 개별 route에서 config.ts 직접 import 불필요

---

## 초기화 계약 (Contract)

```
모든 API 핸들러 진입 순서:
1. params 추출
2. await initDb()        ← DB 커넥션 풀 보장
3. auth 체크             ← requireAuth / requireOwnerOrAdmin
4. input 검증
5. 비즈니스 로직
```

## Soft Delete 계약 (Contract)

```
novels 테이블 접근 시:
- 퍼블릭 읽기: WHERE deleted_at IS NULL (필수)
- 어드민 읽기: deleted_at 컬럼 노출 (선택)
- 쓰기(UPDATE): WHERE deleted_at IS NULL (필수)
- INSERT 중복체크: deleted_at 필터 없음 (의도적)
- 삭제 전용: prune-novels (deleted_at IS NOT NULL)
- 워커: JOIN에 deleted_at IS NULL 포함
```

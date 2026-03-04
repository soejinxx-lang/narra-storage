import { Pool } from "pg";

let pool: Pool | null = null;
let initialized = false;

// Postgres connection pool (런타임 지연 초기화)
function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("railway")
        ? { rejectUnauthorized: false }
        : false,
    });
  }

  return pool;
}

// 초기 테이블 보장 (런타임에서만 호출)
export async function initDb() {
  if (initialized) return;

  const db = getPool();
  const client = await db.connect();

  try {
    // novels
    await client.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cover_url TEXT
      );
    `);

    // ✅ novels.created_at (소설 목록 정렬용)
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    `);

    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS cover_url TEXT;
    `);

    // ✅ A안 핵심: 작품 단위 원문 언어
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS source_language TEXT NOT NULL DEFAULT 'ko';
    `);

    // ✅ 작가 시스템: 소설 소유자 (author_id 컬럼 보장)
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS author_id TEXT;
    `);

    // 🔒 FK 마이그레이션: SET NULL → RESTRICT + NOT NULL
    // Advisory lock으로 동시 실행 데드락 방지
    await client.query(`
      DO $$ BEGIN
        -- Advisory lock 획득 (동시 initDb 실행 직렬화)
        PERFORM pg_advisory_xact_lock(42);

        -- Step 1: orphan author_id 정리 (users에 없는 ID → NULL)
        UPDATE novels SET author_id = NULL
          WHERE author_id IS NOT NULL
          AND author_id NOT IN (SELECT id FROM users);

        -- Step 2: 기존 FK 삭제 (있을 때만)
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'novels_author_id_fkey'
        ) THEN
          ALTER TABLE novels DROP CONSTRAINT novels_author_id_fkey;
        END IF;

        -- Step 3: RESTRICT FK 생성
        ALTER TABLE novels ADD CONSTRAINT novels_author_id_fkey
          FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT;

        -- Step 4: NOT NULL 제약 (author_id NULL인 행이 없을 때만 성공)
        BEGIN
          ALTER TABLE novels ALTER COLUMN author_id SET NOT NULL;
        EXCEPTION WHEN others THEN
          RAISE NOTICE 'author_id NOT NULL 실패: NULL 데이터 존재. 수동 확인 필요.';
        END;

      END $$;
    `);

    // ✅ 소설 메타데이터
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS genre TEXT;
    `);

    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS is_original BOOLEAN DEFAULT TRUE;
    `);

    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS serial_status TEXT DEFAULT 'ongoing';
    `);

    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS episode_format TEXT DEFAULT 'number';
    `);

    // ✅ 테스트 소설 숨김 기능
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
    `);

    // episodes
    await client.query(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        ep INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (novel_id, ep),
        FOREIGN KEY (novel_id)
          REFERENCES novels(id)
          ON DELETE CASCADE
      );
    `);

    // ✅ episodes 컬럼 명시적 보장
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS title TEXT;
    `);

    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS content TEXT;
    `);

    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
    `);

    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;
    `);

    // episode_translations
    await client.query(`
      CREATE TABLE IF NOT EXISTS episode_translations (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        language TEXT NOT NULL,
        translated_text TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        error_message TEXT,
        pipeline_version TEXT DEFAULT 'v1',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (episode_id, language),
        FOREIGN KEY (episode_id)
          REFERENCES episodes(id)
          ON DELETE CASCADE
      );
    `);

    // 🔧 구버전 컬럼 정리
    await client.query(`
      ALTER TABLE episode_translations
      DROP COLUMN IF EXISTS novel_id;
    `);

    await client.query(`
      ALTER TABLE episode_translations
      DROP COLUMN IF EXISTS ep;
    `);

    await client.query(`
      ALTER TABLE episode_translations
      ADD COLUMN IF NOT EXISTS error_message TEXT;
    `);

    await client.query(`
      ALTER TABLE episode_translations
      ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v1';
    `);

    await client.query(`
      ALTER TABLE episode_translations
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);

    // ✅ A안 핵심: 퍼블릭 노출 제어
    await client.query(`
      ALTER TABLE episode_translations
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
    `);

    // entities (고유명사 다국어 지원)
    await client.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        novel_id TEXT NOT NULL,
        source_text TEXT NOT NULL,
        translations JSONB,
        locked BOOLEAN DEFAULT TRUE,
        category TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (novel_id, source_text),
        FOREIGN KEY (novel_id)
          REFERENCES novels(id)
          ON DELETE CASCADE
      );
    `);

    await client.query(`
      ALTER TABLE entities
      ADD COLUMN IF NOT EXISTS translations JSONB;
    `);

    // users (인증 시스템)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ✅ 작가 시스템: 프로필 확장
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bio TEXT;
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `);

    // ✅ 테스트 작가 숨김 기능
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
    `);

    // ✅ Test 작가 자동 숨김 (서진 계정만 보임)
    await client.query(`
      UPDATE users 
      SET is_hidden = TRUE 
      WHERE username = 'Test' AND is_hidden = FALSE;
    `);

    // ✅ System Admin 유저 생성 (Admin API Key용)
    await client.query(`
      INSERT INTO users (id, username, password_hash, name, is_hidden)
      VALUES ('bb2f8cbe-208a-4807-b542-ad2b8b247a9d', 'System', '', 'System Administrator', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `);

    // user_sessions (로그인 토큰)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id UUID NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      );
    `);

    // audio_files (TTS 파생 자산)
    await client.query(`
      CREATE TABLE IF NOT EXISTS audio_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        novel_id TEXT NOT NULL,
        episode INTEGER NOT NULL,
        lang TEXT NOT NULL,
        voice TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (novel_id, episode, lang, voice)
      );
    `);

    // audio_files FK 보강 (고아 레코드 방지)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'audio_files_novel_id_fkey'
        ) THEN
          ALTER TABLE audio_files
          ADD CONSTRAINT audio_files_novel_id_fkey
          FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // ✅ Episode Views (Worker 기반 조회수 시스템)
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
    `);

    // 🧹 레거시 잭팟 컬럼 정리 (v2에서 Worker 시스템으로 대체)
    await client.query(`
      ALTER TABLE episodes
      DROP COLUMN IF EXISTS next_jackpot_at;
    `);

    await client.query(`
      ALTER TABLE episodes
      DROP COLUMN IF EXISTS ghost_pool;
    `);

    // ✅ Community: Comments System (Royal Road Style)
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        episode_id TEXT NOT NULL,
        user_id UUID,
        parent_id UUID,
        content TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        is_hidden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
      );
    `);

    // ✅ Guest Comments Support
    await client.query(`
      ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL;
    `);

    // ✅ Community: Posts System
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        topic TEXT DEFAULT 'general',
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        is_hidden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // ✅ Community: Post Likes
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_post_likes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL,
        user_id UUID NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),

        UNIQUE (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // ✅ Community: Post Comments
    await client.query(`
      CREATE TABLE IF NOT EXISTS community_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        is_hidden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // ✅ 역할 시스템: reader | author | bot | admin
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'reader';
    `);

    // ✅ 약관 동의 기록 (법적 증거 + 버전 추적)
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS agreed_to_terms_at TIMESTAMP;
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS agreed_terms_version TEXT DEFAULT 'v1.0';
    `);

    // 🔄 is_admin → role 통합 마이그레이션 (SSOT: role)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'is_admin'
        ) THEN
          -- is_admin=TRUE인 유저를 role='admin'으로 동기화
          UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND role != 'admin';
          -- is_admin 컬럼 제거
          ALTER TABLE users DROP COLUMN is_admin;
          RAISE NOTICE 'is_admin → role 마이그레이션 완료';
        END IF;
      END $$;
    `);

    // ✅ 소설 출처: official (Admin 생성) | user (퍼블릭 작가 생성)
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'official';
    `);

    // ✅ Soft Delete (삭제 복구 + audit trail + Worker 충돌 방지)
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
    `);

    // ✅ 조건부 인덱스 (deleted_at IS NULL인 행만 인덱싱 — 성능 보장)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_novels_active
      ON novels(id) WHERE deleted_at IS NULL;
    `);

    // ✅ 번역 실패 타입 (ENUM 대신 TEXT — 유연성 유지)
    await client.query(`
      ALTER TABLE episode_translations
      ADD COLUMN IF NOT EXISTS error_type TEXT DEFAULT NULL;
    `);
    // 값: 'SYSTEM_ERROR' | 'INVALID_CONTENT' | 'QUOTA_EXCEEDED' | 'TIMEOUT'

    // ✅ 멱등 쿼터 환불 (refund 정확히 1회 보장)
    await client.query(`
      ALTER TABLE episode_translations
      ADD COLUMN IF NOT EXISTS quota_refunded BOOLEAN DEFAULT FALSE;
    `);

    // ✅ 번역 쿼터 (AI 비용 보호) — 하루 3회, KST 자정 리셋
    await client.query(`
      CREATE TABLE IF NOT EXISTS translation_quota (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        used INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, date)
      );
    `);

    // ✅ 소설 생성 쿼터 (DB 오염 방지) — 하루 3개, 번역 쿼터와 분리
    await client.query(`
      CREATE TABLE IF NOT EXISTS novel_quota (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        used INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, date)
      );
    `);

    // ✅ 유저 플랜 (쿼터 정책 외부화 — 하드코딩 제거)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_plans (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan_type TEXT DEFAULT 'free',
        translation_limit INTEGER DEFAULT 3,
        novel_limit INTEGER DEFAULT 3,
        entity_extract_limit INTEGER DEFAULT 5,
        started_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ✅ Lemon Squeezy 구독 연동
    await client.query(`ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS ls_customer_id TEXT;`);
    await client.query(`ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT;`);
    await client.query(`ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;`);
    await client.query(`ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;`);

    // ✅ E2E 테스트 결과 히스토리 (Playwright → API → DB)
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP DEFAULT NOW(),
        total INTEGER NOT NULL,
        passed INTEGER NOT NULL,
        failed INTEGER NOT NULL,
        skipped INTEGER DEFAULT 0,
        duration INTEGER NOT NULL,
        environment TEXT DEFAULT 'local',
        commit_hash TEXT,
        branch TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS test_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
        test_path TEXT NOT NULL,
        suite TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        duration INTEGER,
        error_message TEXT,
        error_stack TEXT
      );
    `);

    initialized = true;
  } finally {
    client.release();
  }
}

const db = {
  query(text: string, params?: readonly unknown[]) {
    if (params === undefined) {
      return getPool().query(text);
    }
    return getPool().query(text, params as unknown[]);
  },
  async connect() {
    return getPool().connect();
  }
};

export default db;

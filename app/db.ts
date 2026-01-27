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

    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS cover_url TEXT;
    `);

    // ✅ A안 핵심: 작품 단위 원문 언어
    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS source_language TEXT NOT NULL DEFAULT 'ko';
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
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // user_sessions (로그인 토큰)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL,
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

    initialized = true;

    // ✅ Survival Mode: Episode Views & Jackpot Logic
    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE episodes
      ADD COLUMN IF NOT EXISTS next_jackpot_at TIMESTAMP DEFAULT NOW();
    `);

    // ✅ Community: Comments System (Royal Road Style)
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        episode_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
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

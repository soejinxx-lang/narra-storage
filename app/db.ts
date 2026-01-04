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
    // novels 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cover_url TEXT,
        genre TEXT
      );
    `);

    await client.query(`
      ALTER TABLE novels
      ADD COLUMN IF NOT EXISTS cover_url TEXT;
    `);

    // episodes 테이블
    await client.query(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        ep INTEGER NOT NULL,
        title TEXT,
        content TEXT,
        UNIQUE (novel_id, ep),
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
      );
    `);

    // episode_translations 테이블
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

    // ===============================
    // 🆕 entities 테이블 (고유명사)
    // ===============================
    await client.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        novel_id TEXT NOT NULL,
        source_text TEXT NOT NULL,
        translation TEXT NOT NULL,
        locked BOOLEAN DEFAULT true,
        category VARCHAR(50),
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
      CREATE INDEX IF NOT EXISTS idx_entities_novel
      ON entities(novel_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_entities_source
      ON entities(source_text);
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
};

export default db;

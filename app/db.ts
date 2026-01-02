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

    // episodes 테이블 (기존 유지, content = 원문)
    await client.query(`
      CREATE TABLE IF NOT EXISTS episodes (
        novel_id TEXT NOT NULL,
        ep INTEGER NOT NULL,
        title TEXT,
        content TEXT,
        PRIMARY KEY (novel_id, ep),
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
      );
    `);

    // ✅ 언어별 번역 결과 테이블 (B안 핵심 추가)
    await client.query(`
      CREATE TABLE IF NOT EXISTS episode_translations (
        novel_id TEXT NOT NULL,
        ep INTEGER NOT NULL,
        language TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (novel_id, ep, language),
        FOREIGN KEY (novel_id, ep)
          REFERENCES episodes(novel_id, ep)
          ON DELETE CASCADE
      );
    `);

    initialized = true;
  } finally {
    client.release();
  }
}

const db = {
  query(text: string, params?: readonly unknown[]) {
    // 🔴 TypeScript 오버로드 혼동 방지 (동작 동일)
    if (params === undefined) {
      return getPool().query(text);
    }

    return getPool().query(text, params as unknown[]);
  },
};

export default db;

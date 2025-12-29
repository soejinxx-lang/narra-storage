import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Postgres connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

let initialized = false;

// 초기 테이블 보장 (런타임에서만 호출)
export async function initDb() {
  if (initialized) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cover_url TEXT
      );
    `);

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

    initialized = true;
  } finally {
    client.release();
  }
}

export default pool;

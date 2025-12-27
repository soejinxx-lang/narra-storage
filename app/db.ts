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

// 초기 테이블 보장
async function init() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT
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
  } finally {
    client.release();
  }
}

// 서버 시작 시 1회 실행
init().catch((err) => {
  console.error("Failed to initialize database", err);
  process.exit(1);
});

export default pool;

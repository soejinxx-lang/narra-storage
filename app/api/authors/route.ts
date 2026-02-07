import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../db";

export async function GET(_req: NextRequest) {
  await initDb();

  const result = await db.query(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar_url, u.created_at,
           COUNT(n.id) as novel_count
    FROM users u
    LEFT JOIN novels n ON n.author_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `);

  return NextResponse.json({ authors: result.rows });
}

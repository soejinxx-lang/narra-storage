import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../db";
import { isAdmin } from "../../../lib/auth";

export async function GET(req: NextRequest) {
  await initDb();

  const userIsAdmin = await isAdmin(req.headers.get("Authorization"));

  if (userIsAdmin) {
    // Admin: 전체 유저 + role 컬럼 노출 + role 필터 파라미터 지원
    const roleFilter = req.nextUrl.searchParams.get("role");
    const whereClause = roleFilter ? `WHERE u.role = '${roleFilter.replace(/'/g, "''")}'` : "";
    const result = await db.query(`
      SELECT u.id, u.username, u.name, u.bio, u.avatar_url, u.created_at, u.is_hidden, u.role,
             COUNT(n.id) as novel_count
      FROM users u
      LEFT JOIN novels n ON n.author_id = u.id AND n.deleted_at IS NULL
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at ASC
    `);
    return NextResponse.json({ authors: result.rows });
  }

  // 퍼블릭: role='author' + is_hidden=FALSE + 공개 소설 1개 이상
  const result = await db.query(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar_url, u.created_at,
           COUNT(n.id) as novel_count
    FROM users u
    INNER JOIN novels n ON n.author_id = u.id
      AND n.is_hidden = FALSE
      AND n.deleted_at IS NULL
      AND (n.source IS NULL OR n.source IN ('official', 'user'))
    WHERE u.role = 'author'
      AND u.is_hidden = FALSE
    GROUP BY u.id
    HAVING COUNT(n.id) > 0
    ORDER BY u.created_at ASC
  `);

  return NextResponse.json({ authors: result.rows });
}

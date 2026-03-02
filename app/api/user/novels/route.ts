import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../db";
import { requireAuth } from "../../../../lib/requireAuth";

/**
 * GET /api/user/novels
 * 내 소설 목록 (로그인 유저 본인 것만)
 */
export async function GET(req: NextRequest) {
    await initDb();

    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const userId = authResult;

    const result = await db.query(
        `SELECT 
       n.id, n.title, n.description, n.cover_url, n.source_language,
       n.genre, n.serial_status, n.is_hidden, n.source, n.created_at,
       COUNT(e.id) as episode_count,
       COUNT(CASE WHEN et.status = 'DONE' THEN 1 END) as translated_count,
       COUNT(CASE WHEN et.status = 'FAILED' THEN 1 END) as failed_count
     FROM novels n
     LEFT JOIN episodes e ON e.novel_id = n.id
     LEFT JOIN episode_translations et ON et.episode_id = e.id
     WHERE n.author_id = $1 AND n.deleted_at IS NULL
     GROUP BY n.id
     ORDER BY n.created_at DESC`,
        [userId]
    );

    return NextResponse.json({ novels: result.rows });
}

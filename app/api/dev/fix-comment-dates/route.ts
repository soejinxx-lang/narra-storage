import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

/**
 * POST /api/dev/fix-comment-dates
 * 에피소드 업로드일보다 이전 날짜의 댓글들을 보정
 * - 에피소드 created_at ~ NOW() 사이 랜덤 날짜로 재배치
 */
export async function POST(req: NextRequest) {
    const adminErr = await requireAdmin(req);
    if (adminErr) return adminErr;

    await initDb();

    // 에피소드 created_at보다 이른 댓글 찾기
    const badComments = await db.query(`
        SELECT c.id, c.created_at AS comment_date, e.created_at AS episode_date, e.id AS episode_id
        FROM comments c
        JOIN episodes e ON c.episode_id = e.id
        WHERE c.created_at < e.created_at
    `);

    if (badComments.rows.length === 0) {
        return NextResponse.json({ message: "No comments need fixing", fixed: 0 });
    }

    let fixed = 0;
    const now = Date.now();

    for (const row of badComments.rows) {
        const epDate = new Date(row.episode_date).getTime();
        const range = now - epDate;
        // 에피소드 업로드일 ~ 현재 사이 랜덤 날짜
        const newDate = new Date(epDate + Math.random() * range);

        await db.query(
            `UPDATE comments SET created_at = $1 WHERE id = $2`,
            [newDate.toISOString(), row.id]
        );
        fixed++;
    }

    return NextResponse.json({
        message: `Fixed ${fixed} comments`,
        fixed,
        total_checked: badComments.rows.length,
    });
}

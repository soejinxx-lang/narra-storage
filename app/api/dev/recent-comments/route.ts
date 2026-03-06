import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 200);

    try {
        const result = await db.query(`
            SELECT
                c.id,
                c.content,
                c.created_at,
                c.parent_id,
                u.nickname,
                u.role AS user_role,
                e.ep,
                n.id   AS novel_id,
                n.title AS novel_title,
                lg.language_code
            FROM comments c
            JOIN users u ON c.user_id = u.id
            JOIN episodes e ON c.episode_id = e.id
            JOIN novels n ON e.novel_id = n.id
            LEFT JOIN episode_translations lt
                ON lt.episode_id = e.id AND lt.language = 'ko'
            LEFT JOIN (
                SELECT DISTINCT ON (episode_id) episode_id, language_code
                FROM episode_translations
                WHERE status = 'completed'
                ORDER BY episode_id, created_at DESC
            ) lg ON lg.episode_id = e.id
            ORDER BY c.created_at DESC
            LIMIT $1
        `, [limit]);

        return NextResponse.json({
            comments: result.rows.map(r => ({
                id:          r.id,
                content:     r.content,
                createdAt:   r.created_at,
                isReply:     !!r.parent_id,
                nickname:    r.nickname,
                userRole:    r.user_role,
                ep:          r.ep,
                novelId:     r.novel_id,
                novelTitle:  r.novel_title,
            })),
        });
    } catch (err) {
        console.error("[recent-comments]", err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

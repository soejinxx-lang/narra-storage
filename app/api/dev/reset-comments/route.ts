import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

/**
 * 댓글 리셋 API
 * GET /api/dev/reset-comments?novel=novel-xxx
 * 
 * 봇 댓글 전부 삭제 (is_hidden = TRUE인 유저의 댓글)
 */
export async function GET(req: NextRequest) {
    // 🔒 Admin API Key 체크
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(req.url);
    const novelId = searchParams.get('novel');

    if (!novelId) {
        return NextResponse.json(
            { error: 'novel parameter required' },
            { status: 400 }
        );
    }

    try {
        // 1. 봇 댓글 삭제
        const commentsResult = await db.query(
            `DELETE FROM comments 
       WHERE episode_id IN (
         SELECT id FROM episodes WHERE novel_id = $1
       )
       AND user_id IN (
         SELECT id FROM users WHERE is_hidden = TRUE
       )`,
            [novelId]
        );

        // 2. 봇 유저 삭제 (댓글 삭제 후)
        const usersResult = await db.query(
            `DELETE FROM users WHERE is_hidden = TRUE AND username LIKE 'reader%'`
        );

        console.log(`🗑️ Deleted ${commentsResult.rowCount} bot comments from ${novelId}`);
        console.log(`🗑️ Deleted ${usersResult.rowCount} bot users`);

        return NextResponse.json({
            success: true,
            deletedComments: commentsResult.rowCount,
            deletedUsers: usersResult.rowCount,
            novel: novelId
        });
    } catch (error) {
        console.error('Reset Comments Error:', error);
        return NextResponse.json(
            { error: 'Failed to reset comments' },
            { status: 500 }
        );
    }
}

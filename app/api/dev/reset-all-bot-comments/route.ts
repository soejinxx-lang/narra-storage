/**
 * 전체 봇 댓글 삭제 API
 * GET /api/dev/reset-all-bot-comments
 *
 * role='bot' 유저의 댓글 전부 삭제. 유저 자체는 삭제하지 않음.
 */

import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    try {
        const result = await db.query(
            `DELETE FROM comments
             WHERE user_id IN (SELECT id FROM users WHERE role = 'bot')`
        );

        const count = result.rowCount ?? 0;
        console.log(`🗑️ [reset-all] Deleted ${count} bot comments`);

        return NextResponse.json({
            success: true,
            deletedComments: count,
        });
    } catch (error) {
        console.error("[reset-all] Error:", error);
        return NextResponse.json(
            { error: "Failed to delete bot comments", details: String(error) },
            { status: 500 }
        );
    }
}

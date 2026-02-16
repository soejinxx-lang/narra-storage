/**
 * 예약 댓글 공개 스케줄러
 * 
 * 1분마다 호출 (cron 또는 외부 서비스)
 * scheduled_at <= NOW() 인 숨겨진 댓글을 최대 2개씩 공개
 */

import { NextResponse } from "next/server";
import db from "../../../db";

export async function POST() {
    try {
        const result = await db.query(`
            UPDATE comments
            SET is_hidden = FALSE
            WHERE id IN (
                SELECT id FROM comments
                WHERE is_hidden = TRUE AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
                ORDER BY scheduled_at ASC
                LIMIT 2
            )
            RETURNING id, episode_id, scheduled_at
        `);

        const revealed = result.rows.length;

        if (revealed > 0) {
            console.log(`👁 [reveal] ${revealed} comments revealed:`, result.rows.map((r: { id: string }) => r.id));
        }

        return NextResponse.json({
            revealed,
            comments: result.rows,
        });
    } catch (error) {
        console.error("Reveal Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

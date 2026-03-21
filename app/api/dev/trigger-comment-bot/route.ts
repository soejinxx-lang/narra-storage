import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { runKoreanCommentBot } from "../run-comment-bot/ko-engine";

export const maxDuration = 300;

/**
 * POST /api/dev/trigger-comment-bot
 * 어드민 수동 댓글봇 트리거
 *
 * body: { episodeId: string, count: number }
 *
 * - botLang='ko_manual'로 직접 INSERT → 별도 UPDATE 불필요
 * - ko_manual은 worker gap 계산 / comment-stats bot_cnt 양쪽에서 제외
 */
export async function POST(req: NextRequest) {
    try {
        // 인증 — CRON_SECRET
        const secret = req.headers.get("x-cron-secret");
        if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { episodeId, count } = body as { episodeId: string; count: number };

        if (!episodeId || typeof count !== "number" || count < 1 || count > 100) {
            return NextResponse.json(
                { error: "episodeId, count(1~100) 필수" },
                { status: 400 }
            );
        }

        // episode → novel 조회
        const epResult = await db.query(
            `SELECT e.id, e.novel_id, e.created_at
             FROM episodes e
             WHERE e.id = $1 AND e.status = 'published'`,
            [episodeId]
        );
        if (epResult.rows.length === 0) {
            return NextResponse.json({ error: "Episode not found" }, { status: 404 });
        }
        const { novel_id, created_at } = epResult.rows[0];
        const publishedAt = new Date(created_at);

        // 댓글 생성 — botLang='ko_manual' 직접 전달 (INSERT 시점에 태깅)
        const result = await runKoreanCommentBot(
            novel_id,
            count,
            episodeId,
            false,
            publishedAt,
            undefined,       // externalTimestamps
            'ko_manual',     // botLang — 자동봇 gap 계산 제외용 태그
        );

        console.log(`[trigger-comment-bot] inserted=${result.inserted} as ko_manual`);

        return NextResponse.json({
            ok: true,
            inserted: result.inserted,
            episodeId,
            note: "bot_lang=ko_manual 태그 완료 — 자동봇 gap 계산 제외됨",
        });
    } catch (err) {
        console.error("[trigger-comment-bot] Error:", err);
        return NextResponse.json(
            { error: String(err) },
            { status: 500 }
        );
    }
}

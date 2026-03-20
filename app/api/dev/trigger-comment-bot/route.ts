import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { runKoreanCommentBot } from "../run-comment-bot/ko-engine";

/**
 * POST /api/dev/trigger-comment-bot
 * 어드민 수동 댓글봇 트리거
 *
 * body: { episodeId: string, count: number }
 *
 * - count만큼 runKoreanCommentBot 직접 호출
 * - 삽입된 댓글은 bot_lang = 'ko_manual'로 태그 → 자동봇 gap 계산 제외
 * - 분포 수렴 구조 보존
 */
export async function POST(req: NextRequest) {
    try {
        // 인증 — 기존 어드민 패턴과 동일 (ADMIN_API_KEY Bearer)
        const auth = req.headers.get("authorization");
        if (auth !== `Bearer ${process.env.ADMIN_API_KEY}`) {
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

        // 댓글 생성 (ko-engine)
        const result = await runKoreanCommentBot(
            novel_id,
            count,
            episodeId,
            false,
            publishedAt,
        );

        // 방금 생성된 댓글을 ko_manual로 태그 UPDATE
        // created_at 기준 최근 N개 중 bot_lang='ko'인 것만 변경
        await db.query(
            `UPDATE comments
             SET bot_lang = 'ko_manual'
             WHERE episode_id = $1
               AND bot_lang = 'ko'
               AND created_at >= NOW() - INTERVAL '1 minute'`,
            [episodeId]
        );

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

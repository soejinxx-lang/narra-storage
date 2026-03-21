/**
 * 봇 댓글 현황 통계 v3 — 워커 동기화
 * GET /api/dev/comment-stats
 *
 * DB에 저장된 views_eff, bot_target을 읽어서 워커와 항상 동일한 값을 표시.
 * 워커가 아직 실행 전(NULL)이면 shared model로 fallback 계산.
 */

import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";
import { MODEL_PARAMS, calcBotTarget, calcCMax, calcD, calcSaturation } from "../../../../lib/comment-bot-model";

function overflowTier(ratio: number): string {
    if (ratio > 2.0) return "spike";
    if (ratio > 1.2) return "under";
    return "ok";
}

export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    try {
        // views_eff, bot_target — 워커가 매 사이클 업데이트
        const result = await db.query(`
            SELECT
                e.id            AS episode_id,
                e.novel_id,
                e.ep,
                e.views,
                e.views_eff,
                e.bot_target    AS db_bot_target,
                e.created_at    AS published_at,
                n.title         AS novel_title,
                COALESCE(bc.bot_cnt, 0) AS bot_count,
                lc.last_comment_at
            FROM episodes e
            JOIN novels n ON e.novel_id = n.id
            LEFT JOIN (
                SELECT c.episode_id, COUNT(*) AS bot_cnt
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE u.role = 'bot'
                  AND (c.bot_lang IS NULL OR c.bot_lang != 'ko_manual')
                GROUP BY c.episode_id
            ) bc ON bc.episode_id = e.id
            LEFT JOIN (
                SELECT episode_id, MAX(created_at) AS last_comment_at
                FROM comments
                GROUP BY episode_id
            ) lc ON lc.episode_id = e.id
            WHERE e.status = 'published'
              AND n.deleted_at IS NULL
            ORDER BY n.id, e.ep ASC
        `);

        const now = Date.now();
        let totalTarget = 0;
        let totalActual = 0;

        type EpStat = {
            episodeId: string; ep: number; views: number; views_eff: number;
            publishedAt: string; lastCommentAt: string | null;
            daysSinceUpload: number; daysSinceLastComment: number | null;
            D: number; C_max: number; saturation: number; botTarget: number;
            actual: number; gap: number;
            overflow: number; overflowTier: string; commentRate: number;
            targetSource: 'db' | 'fallback';
        };

        const byNovel: Record<string, {
            novelId: string; title: string;
            episodes: EpStat[];
            target: number; actual: number; gap: number;
        }> = {};

        for (const row of result.rows) {
            const views = parseInt(row.views) || 0;
            const ep = parseInt(row.ep) || 1;
            const publishedAt = new Date(row.published_at);
            const lastCommentAt = row.last_comment_at ? new Date(row.last_comment_at) : null;
            const daysSinceUpload = Math.floor((now - publishedAt.getTime()) / 86400000);
            const daysSinceLastComment = lastCommentAt
                ? Math.floor((now - lastCommentAt.getTime()) / 86400000)
                : null;
            const actual = parseInt(row.bot_count) || 0;

            // views_eff: DB에 있으면 워커와 동일한 댐핑값, 없으면 현재 views 사용
            const views_eff = row.views_eff !== null ? parseFloat(row.views_eff) : views;
            const targetSource: 'db' | 'fallback' = row.db_bot_target !== null ? 'db' : 'fallback';

            // bot_target: DB 우선, fallback은 shared model 계산
            const botTarget = row.db_bot_target !== null
                ? parseInt(row.db_bot_target)
                : calcBotTarget(views_eff, ep, daysSinceUpload);

            // 대시보드 display용 보조값
            const D = calcD(ep);
            const C_max = calcCMax(views_eff, ep);
            const saturation = calcSaturation(daysSinceUpload);

            const gap = Math.max(0, botTarget - actual);
            const overflow = C_max > 0 ? parseFloat((actual / C_max).toFixed(2)) : 0;
            const commentRate = views > 0 ? parseFloat((actual / views).toFixed(4)) : 0;

            totalTarget += botTarget;
            totalActual += actual;

            if (!byNovel[row.novel_id]) {
                byNovel[row.novel_id] = {
                    novelId: row.novel_id,
                    title: row.novel_title,
                    episodes: [],
                    target: 0, actual: 0, gap: 0,
                };
            }
            byNovel[row.novel_id].episodes.push({
                episodeId: row.episode_id,
                ep, views, views_eff,
                publishedAt: publishedAt.toISOString(),
                lastCommentAt: lastCommentAt?.toISOString() ?? null,
                daysSinceUpload, daysSinceLastComment,
                D: parseFloat(D.toFixed(2)),
                C_max: parseFloat(C_max.toFixed(2)),
                saturation: parseFloat(saturation.toFixed(3)),
                botTarget,
                actual, gap,
                overflow, overflowTier: overflowTier(overflow), commentRate,
                targetSource,
            });
            byNovel[row.novel_id].target += botTarget;
            byNovel[row.novel_id].actual += actual;
            byNovel[row.novel_id].gap += gap;
        }

        return NextResponse.json({
            formulaParams: {
                engagementRate: MODEL_PARAMS.ENGAGEMENT_RATE,
                botRatio: MODEL_PARAMS.CUM_BOT_RATIO,
                cap: MODEL_PARAMS.MAX_COMMENT_CAP_BASE,
                lambda: MODEL_PARAMS.CUM_LAMBDA,
                t0: MODEL_PARAMS.CUM_T0,
            },
            summary: {
                totalTarget,
                totalActual,
                totalGap: Math.max(0, totalTarget - totalActual),
                fillRate: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 100,
            },
            novels: Object.values(byNovel),
        });
    } catch (err) {
        console.error("[comment-stats] Error:", err);
        try {
            const colRes = await db.query(`
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_name IN ('users','episodes','comments','novels')
                ORDER BY table_name, ordinal_position
            `);
            return NextResponse.json({ error: String(err), debug_columns: colRes.rows }, { status: 500 });
        } catch {
            return NextResponse.json({ error: String(err) }, { status: 500 });
        }
    }
}

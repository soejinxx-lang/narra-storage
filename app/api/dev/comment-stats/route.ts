/**
 * 봇 댓글 현황 통계 (관측 파이프라인 v2)
 * GET /api/dev/comment-stats
 *
 * Observed / Derived / Model output / 진단지표 레이어 분리
 */

import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

// ── formula 파라미터 (worker/index.ts calcCumulativeTarget와 동기화) ──
const CUM_K         = 1.0;
const CUM_EXP       = 0.4;
const CUM_LAMBDA    = 0.4;
const CUM_T0        = 0.3;
const CUM_BOT_RATIO = 0.7;

function generateNovelQ(novelId: string): number {
    let h = 0;
    for (let i = 0; i < novelId.length; i++) h = ((h << 5) - h + novelId.charCodeAt(i)) | 0;
    const hash = Math.abs(h);
    const u1 = ((hash % 10000) + 1) / 10001;
    const u2 = (((hash * 7919) % 10000) + 1) / 10001;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0.2, Math.min(3.0, Math.exp(-0.15 + 0.45 * z)));
}

function overflowTier(ratio: number): string {
    if (ratio > 2.0) return "spike";   // social spike — 모델 오류 아님
    if (ratio > 1.2) return "under";   // 모델 과소추정
    return "ok";
}

export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    try {
        const result = await db.query(`
            SELECT
                e.id          AS episode_id,
                e.novel_id,
                e.ep,
                e.views,
                e.created_at  AS published_at,
                n.title       AS novel_title,
                COALESCE(bc.bot_cnt, 0)        AS bot_count,
                lc.last_comment_at
            FROM episodes e
            JOIN novels n ON e.novel_id = n.id
            LEFT JOIN (
                SELECT c.episode_id, COUNT(*) AS bot_cnt
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE u.role = 'bot'
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
            // Observed
            ep: number; views: number; wordCount: number | null;
            publishedAt: string; lastCommentAt: string | null;
            // Derived
            daysSinceUpload: number; daysSinceLastComment: number | null;
            // Model output
            Q: number; D: number; epBoost: number;
            C_max: number; saturation: number; botTarget: number;
            // Runtime
            actual: number; gap: number;
            // Diagnostic
            overflow: number; overflowTier: string; commentRate: number;
        };

        const byNovel: Record<string, {
            novelId: string; title: string;
            episodes: EpStat[];
            target: number; actual: number; gap: number;
        }> = {};

        for (const row of result.rows) {
            const views           = parseInt(row.views) || 0;
            const ep              = parseInt(row.ep) || 1;
            const publishedAt     = new Date(row.published_at);
            const lastCommentAt   = row.last_comment_at ? new Date(row.last_comment_at) : null;
            const daysSinceUpload = Math.floor((now - publishedAt.getTime()) / 86400000);
            const daysSinceLastComment = lastCommentAt
                ? Math.floor((now - lastCommentAt.getTime()) / 86400000)
                : null;
            const actual = parseInt(row.bot_count) || 0;

            // Model output
            const Q          = generateNovelQ(row.novel_id);
            const D          = 1 / (1 + 0.08 * Math.max(0, ep - 1));   // ep-index decay
            const epBoost    = 1.0;                                       // reserved
            const C_max      = CUM_K * Q * Math.pow(Math.max(views, 1), CUM_EXP) * D * epBoost;
            const saturation = 1 - Math.exp(-CUM_LAMBDA * (daysSinceUpload + CUM_T0));
            const minBot     = daysSinceUpload < 0.1 ? 1 : 0;
            const botTarget  = Math.max(minBot, Math.floor(C_max * saturation * CUM_BOT_RATIO));

            const gap          = Math.max(0, botTarget - actual);
            const overflow     = C_max > 0 ? parseFloat((actual / C_max).toFixed(2)) : 0;
            const commentRate  = views > 0 ? parseFloat((actual / views).toFixed(4)) : 0;

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
                // Observed
                ep, views,
                publishedAt: publishedAt.toISOString(),
                lastCommentAt: lastCommentAt?.toISOString() ?? null,
                // Derived
                daysSinceUpload, daysSinceLastComment,
                // Model output
                Q: parseFloat(Q.toFixed(2)),
                D: parseFloat(D.toFixed(2)),
                epBoost,
                C_max: parseFloat(C_max.toFixed(2)),
                saturation: parseFloat(saturation.toFixed(3)),
                botTarget,
                // Runtime
                actual, gap,
                // Diagnostic
                overflow, overflowTier: overflowTier(overflow), commentRate,
            });
            byNovel[row.novel_id].target += botTarget;
            byNovel[row.novel_id].actual += actual;
            byNovel[row.novel_id].gap    += gap;
        }

        return NextResponse.json({
            // formula 파라미터 노출 (어드민에서 현재 공식 즉시 확인 가능)
            formulaParams: { K: CUM_K, exp: CUM_EXP, lambda: CUM_LAMBDA, t0: CUM_T0, botRatio: CUM_BOT_RATIO },
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
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

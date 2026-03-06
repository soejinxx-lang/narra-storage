/**
 * 봇 댓글 현황 통계
 * GET /api/dev/comment-stats
 *
 * 각 에피소드별 기대 봇 댓글 수 vs 실제 봇 댓글 수 반환
 */

import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

// worker/index.ts의 sampleCommentCount와 동일한 공식
const K = 0.08;
const B = 0.55;
const BOT_RATIO = 0.7;

function simpleHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function generateNovelQ(novelId: string): number {
    const hash = simpleHash(novelId);
    const u1 = ((hash % 10000) + 1) / 10001;
    const u2 = (((hash * 7919) % 10000) + 1) / 10001;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const base = Math.exp(-0.15 + 0.45 * z);
    return Math.max(0.2, Math.min(3.0, base));
}

function calcTargetBot(views: number, epNumber: number, daysSince: number, Q: number): number {
    if (views <= 0) return 0;
    const D = 1 / (1 + 0.08 * Math.max(0, epNumber - 1));
    const A = epNumber <= 3
        ? Math.max(0.7, 1 / (1 + 0.01 * daysSince))
        : 1 / (1 + 0.15 * daysSince);
    let lambda = Q * K * Math.pow(views, 1 - B) * D * A;
    if (views < 15) lambda *= 0.3;
    else if (views < 30) lambda *= 0.6;
    lambda = Math.min(lambda, views * 0.02);
    // Poisson 아닌 λ 자체를 expected value로 사용 (통계 표시용)
    return Math.round(lambda * BOT_RATIO);
}

export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    try {
        // 에피소드별 실제 봇 댓글 수 + 메타데이터
        const result = await db.query(`
            SELECT
                e.id AS episode_id,
                e.novel_id,
                e.ep,
                e.views,
                e.created_at,
                n.title AS novel_title,
                COALESCE(bc.bot_cnt, 0) AS bot_count
            FROM episodes e
            JOIN novels n ON e.novel_id = n.id
            LEFT JOIN (
                SELECT c.episode_id, COUNT(*) AS bot_cnt
                FROM comments c JOIN users u ON c.user_id = u.id
                WHERE u.role = 'bot'
                GROUP BY c.episode_id
            ) bc ON bc.episode_id = e.id
            WHERE e.status = 'published'
              AND n.deleted_at IS NULL
            ORDER BY n.id, e.ep ASC
        `);

        const now = Date.now();
        let totalTarget = 0;
        let totalActual = 0;

        const byNovel: Record<string, {
            novelId: string;
            title: string;
            episodes: { ep: number; views: number; target: number; actual: number; gap: number }[];
            target: number;
            actual: number;
            gap: number;
        }> = {};

        for (const row of result.rows) {
            const views     = parseInt(row.views) || 0;
            const ep        = parseInt(row.ep) || 1;
            const daysSince = Math.floor((now - new Date(row.created_at).getTime()) / 86400000);
            const Q         = generateNovelQ(row.novel_id);
            const target    = calcTargetBot(views, ep, daysSince, Q);
            const actual    = parseInt(row.bot_count) || 0;
            const gap       = Math.max(0, target - actual);

            totalTarget += target;
            totalActual += actual;

            if (!byNovel[row.novel_id]) {
                byNovel[row.novel_id] = {
                    novelId: row.novel_id,
                    title: row.novel_title,
                    episodes: [],
                    target: 0, actual: 0, gap: 0,
                };
            }
            byNovel[row.novel_id].episodes.push({ ep, views, target, actual, gap });
            byNovel[row.novel_id].target += target;
            byNovel[row.novel_id].actual += actual;
            byNovel[row.novel_id].gap    += gap;
        }

        return NextResponse.json({
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

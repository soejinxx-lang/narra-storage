import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

/**
 * 댓글 정리 (prune) API — v4 모델 기준 초과분만 삭제
 * GET /api/dev/prune-comments?novel=novel-xxx
 * GET /api/dev/prune-comments?novel=novel-xxx&dry=true  (시뮬레이션)
 * 
 * 각 에피소드의 현재 조회수/화수/경과일 기준으로 v4 목표치를 계산하고,
 * 초과분의 봇 댓글만 삭제 (가장 최근 것부터).
 */

// ── v4 모델 (worker/index.ts와 동일) ──
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
    const monthsSinceEpoch = Math.floor(Date.now() / (30 * 86400000));
    const drift = Math.sin(hash + monthsSinceEpoch * 0.3) * 0.05;
    return Math.max(0.2, Math.min(3.0, base + drift));
}

function calculateV4Target(
    views: number, epNumber: number, daysSince: number, Q: number
): number {
    if (views <= 0) return 0;

    const k = 0.08;
    const b = 0.55;

    const D = 1 / (1 + 0.08 * Math.max(0, epNumber - 1));
    const A = epNumber <= 3
        ? Math.max(0.7, 1 / (1 + 0.01 * daysSince))
        : 1 / (1 + 0.15 * daysSince);

    let λ = Q * k * Math.pow(views, 1 - b) * D * A;

    if (views < 15) λ *= 0.3;
    else if (views < 30) λ *= 0.6;

    λ = Math.min(λ, views * 0.02);

    // 정리용이므로 λ의 1.5배를 상한으로 사용 (약간 여유)
    return Math.ceil(λ * 1.5);
}

export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(req.url);
    const novelId = searchParams.get('novel');
    const dryRun = searchParams.get('dry') === 'true';

    if (!novelId) {
        return NextResponse.json(
            { error: 'novel parameter required. Use ?novel=novel-xxx' },
            { status: 400 }
        );
    }

    try {
        const Q = generateNovelQ(novelId);
        const now = new Date();

        // 에피소드별 조회수 + 댓글 수 조회
        const result = await db.query(`
            SELECT 
                e.id, e.ep, e.views,
                COALESCE(e.scheduled_at, e.created_at) AS published_at,
                COALESCE(cc.cnt, 0) AS comment_count
            FROM episodes e
            LEFT JOIN (
                SELECT episode_id, COUNT(*) AS cnt
                FROM comments GROUP BY episode_id
            ) cc ON cc.episode_id = e.id
            WHERE e.novel_id = $1 AND e.status = 'published'
            ORDER BY e.ep ASC
        `, [novelId]);

        const episodes: {
            ep: number;
            views: number;
            existing: number;
            target: number;
            toDelete: number;
        }[] = [];
        let totalDeleted = 0;

        for (const row of result.rows) {
            const epNumber = parseInt(row.ep) || 1;
            const views = parseInt(row.views) || 0;
            const existing = parseInt(row.comment_count) || 0;
            const publishedAt = new Date(row.published_at);
            const daysSince = Math.floor(
                (now.getTime() - publishedAt.getTime()) / 86400000
            );

            const target = calculateV4Target(views, epNumber, daysSince, Q);
            const toDelete = Math.max(0, existing - target);

            episodes.push({ ep: epNumber, views, existing, target, toDelete });

            if (toDelete > 0 && !dryRun) {
                // 가장 최근 봇 댓글부터 삭제
                await db.query(`
                    DELETE FROM comments WHERE id IN (
                        SELECT c.id FROM comments c
                        WHERE c.episode_id = $1
                        ORDER BY c.created_at DESC
                        LIMIT $2
                    )
                `, [row.id, toDelete]);
                totalDeleted += toDelete;
            } else if (toDelete > 0) {
                totalDeleted += toDelete;
            }
        }

        console.log(`🔪 [Prune] ${dryRun ? 'DRY RUN' : 'EXECUTED'}: ${totalDeleted} comments from ${novelId} (Q=${Q.toFixed(2)})`);

        return NextResponse.json({
            success: true,
            dryRun,
            novelId,
            Q: parseFloat(Q.toFixed(3)),
            totalDeleted,
            episodes,
        });
    } catch (error) {
        console.error('Prune Comments Error:', error);
        return NextResponse.json(
            { error: 'Failed to prune comments' },
            { status: 500 }
        );
    }
}

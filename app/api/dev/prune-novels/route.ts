import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

/**
 * Soft-deleted 소설 정리 API
 * GET /api/dev/prune-novels            — 7일 지난 soft-deleted 소설 영구 삭제
 * GET /api/dev/prune-novels?dry=true    — 시뮬레이션 (삭제 안 함)
 *
 * 모든 FK가 ON DELETE CASCADE이므로 소설만 삭제하면
 * episodes, episode_translations, comments, entities, audio_files 전부 연쇄 삭제됨.
 *
 * Vercel Cron 또는 수동 호출로 사용
 */
export async function GET(req: NextRequest) {
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dry") === "true";

    try {
        // 7일 이상 지난 soft-deleted 소설 조회
        const candidates = await db.query(`
            SELECT id, title, author_id, deleted_at,
                   (SELECT COUNT(*) FROM episodes WHERE novel_id = novels.id) AS episode_count
            FROM novels
            WHERE deleted_at IS NOT NULL
              AND deleted_at < NOW() - INTERVAL '7 days'
            ORDER BY deleted_at ASC
        `);

        if (candidates.rowCount === 0) {
            return NextResponse.json({
                success: true,
                dryRun,
                message: "No novels to prune",
                deleted: 0,
            });
        }

        const novelIds = candidates.rows.map((r: { id: string }) => r.id);
        let deletedNovels = 0;

        if (!dryRun) {
            // CASCADE로 episodes, translations, comments, entities, audio 전부 연쇄 삭제
            const result = await db.query(
                "DELETE FROM novels WHERE id = ANY($1)",
                [novelIds]
            );
            deletedNovels = result.rowCount || 0;

            console.log(
                `🗑️ [Prune Novels] EXECUTED: ${deletedNovels} novels permanently deleted (cascade: episodes, translations, comments, entities, audio)`
            );
        } else {
            deletedNovels = candidates.rowCount || 0;
            console.log(
                `🗑️ [Prune Novels] DRY RUN: would delete ${deletedNovels} novels`
            );
        }

        return NextResponse.json({
            success: true,
            dryRun,
            deletedNovels,
            novels: candidates.rows.map((r: { id: string; title: string; deleted_at: string; episode_count: string }) => ({
                id: r.id,
                title: r.title,
                deletedAt: r.deleted_at,
                episodeCount: parseInt(r.episode_count || "0"),
            })),
        });
    } catch (error) {
        console.error("Prune Novels Error:", error);
        return NextResponse.json(
            { error: "Failed to prune novels" },
            { status: 500 }
        );
    }
}


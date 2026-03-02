import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../db";
import { requireAuth } from "../../../../lib/requireAuth";
import { isAdmin } from "../../../../lib/auth";

// Plan별 쿼터 정의
const PLAN_QUOTAS: Record<string, { novel: number; translation: number; entity: number }> = {
    free: { novel: 3, translation: 3, entity: 5 },
    basic: { novel: 10, translation: 30, entity: 50 },
    author_pro: { novel: 999, translation: 999, entity: 999 },
    reader_premium: { novel: 3, translation: 3, entity: 5 }, // 독자 Premium은 작가 쿼터 미변경
};

/**
 * GET /api/user/plan
 * 현재 로그인 유저의 플랜 조회
 */
export async function GET(req: NextRequest) {
    await initDb();

    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const userId = authResult;

    const result = await db.query(
        `SELECT plan_type, translation_limit, novel_limit, entity_extract_limit,
            ls_customer_id, ls_subscription_id, expires_at, trial_ends_at, started_at
     FROM user_plans WHERE user_id = $1`,
        [userId]
    );

    if (result.rowCount === 0) {
        return NextResponse.json({
            plan_type: "free",
            translation_limit: 3,
            novel_limit: 3,
            entity_extract_limit: 5,
            ls_customer_id: null,
            ls_subscription_id: null,
            expires_at: null,
            trial_ends_at: null,
        });
    }

    const plan = result.rows[0];

    // Premium/Pro 만료 체크
    if (plan.plan_type !== "free" && plan.expires_at && new Date(plan.expires_at) < new Date()) {
        const freeQuota = PLAN_QUOTAS.free;
        await db.query(
            `UPDATE user_plans SET plan_type = 'free',
        translation_limit = $2, novel_limit = $3, entity_extract_limit = $4
       WHERE user_id = $1`,
            [userId, freeQuota.translation, freeQuota.novel, freeQuota.entity]
        );
        plan.plan_type = "free";
        plan.translation_limit = freeQuota.translation;
        plan.novel_limit = freeQuota.novel;
        plan.entity_extract_limit = freeQuota.entity;
    }

    // Trial 만료 체크
    if (plan.trial_ends_at && new Date(plan.trial_ends_at) < new Date() && !plan.ls_subscription_id) {
        const freeQuota = PLAN_QUOTAS.free;
        await db.query(
            `UPDATE user_plans SET plan_type = 'free',
        translation_limit = $2, novel_limit = $3, entity_extract_limit = $4,
        trial_ends_at = NULL
       WHERE user_id = $1`,
            [userId, freeQuota.translation, freeQuota.novel, freeQuota.entity]
        );
        plan.plan_type = "free";
    }

    return NextResponse.json(plan);
}

/**
 * PATCH /api/user/plan
 * 플랜 업데이트 (admin API key only — webhook에서 호출)
 */
export async function PATCH(req: NextRequest) {
    await initDb();

    // Admin API Key 검증
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !isAdmin(authHeader)) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const { user_id, plan_type, ls_customer_id, ls_subscription_id, expires_at, trial_ends_at } = body;

    if (!user_id) {
        return NextResponse.json({ error: "MISSING_USER_ID" }, { status: 400 });
    }

    const planKey = plan_type ?? "free";
    const quota = PLAN_QUOTAS[planKey] ?? PLAN_QUOTAS.free;

    // UPSERT
    await db.query(
        `INSERT INTO user_plans (user_id, plan_type, ls_customer_id, ls_subscription_id, expires_at, trial_ends_at,
                             translation_limit, novel_limit, entity_extract_limit, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       plan_type = COALESCE($2, user_plans.plan_type),
       ls_customer_id = COALESCE($3, user_plans.ls_customer_id),
       ls_subscription_id = COALESCE($4, user_plans.ls_subscription_id),
       expires_at = COALESCE($5, user_plans.expires_at),
       trial_ends_at = COALESCE($6, user_plans.trial_ends_at),
       translation_limit = $7,
       novel_limit = $8,
       entity_extract_limit = $9`,
        [user_id, planKey, ls_customer_id ?? null, ls_subscription_id ?? null,
            expires_at ?? null, trial_ends_at ?? null,
            quota.translation, quota.novel, quota.entity]
    );

    return NextResponse.json({ ok: true });
}

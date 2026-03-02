import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../db";
import { requireAuth } from "../../../../lib/requireAuth";
import { isAdmin } from "../../../../lib/auth";

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
            ls_customer_id, ls_subscription_id, expires_at, started_at
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
        });
    }

    const plan = result.rows[0];

    // Premium 만료 체크
    if (plan.plan_type === "premium" && plan.expires_at && new Date(plan.expires_at) < new Date()) {
        await db.query(
            `UPDATE user_plans SET plan_type = 'free' WHERE user_id = $1`,
            [userId]
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
    const { user_id, plan_type, ls_customer_id, ls_subscription_id, expires_at } = body;

    if (!user_id) {
        return NextResponse.json({ error: "MISSING_USER_ID" }, { status: 400 });
    }

    // UPSERT
    await db.query(
        `INSERT INTO user_plans (user_id, plan_type, ls_customer_id, ls_subscription_id, expires_at, started_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       plan_type = COALESCE($2, user_plans.plan_type),
       ls_customer_id = COALESCE($3, user_plans.ls_customer_id),
       ls_subscription_id = COALESCE($4, user_plans.ls_subscription_id),
       expires_at = COALESCE($5, user_plans.expires_at)`,
        [user_id, plan_type ?? "free", ls_customer_id ?? null, ls_subscription_id ?? null, expires_at ?? null]
    );

    // Premium이면 쿼터 상향
    if (plan_type === "premium") {
        await db.query(
            `UPDATE user_plans SET translation_limit = 999, novel_limit = 999, entity_extract_limit = 999
       WHERE user_id = $1`,
            [user_id]
        );
    } else if (plan_type === "free") {
        await db.query(
            `UPDATE user_plans SET translation_limit = 3, novel_limit = 3, entity_extract_limit = 5
       WHERE user_id = $1`,
            [user_id]
        );
    }

    return NextResponse.json({ ok: true });
}

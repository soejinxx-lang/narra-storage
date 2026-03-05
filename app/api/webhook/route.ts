import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../db";
import { isAdmin } from "../../../../lib/auth";

/**
 * GET /api/webhook/check?id=xxx — 중복 체크
 * POST /api/webhook/mark — 처리 완료 기록
 * GET /api/webhook/current-plan?user_id=xxx — 현재 플랜 조회 (ordering용)
 *
 * admin auth 필요 (webhook route에서만 호출)
 */

export async function GET(req: NextRequest) {
    await initDb();

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !isAdmin(authHeader)) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("id");
    const userId = searchParams.get("user_id");

    // 중복 체크
    if (eventId) {
        const result = await db.query(
            `SELECT 1 FROM processed_webhooks WHERE event_id = $1`,
            [eventId]
        );
        return NextResponse.json({ exists: (result.rowCount ?? 0) > 0 });
    }

    // 현재 플랜 조회
    if (userId) {
        const result = await db.query(
            `SELECT plan_type, last_event_at FROM user_plans WHERE user_id = $1`,
            [userId]
        );
        if ((result.rowCount ?? 0) === 0) {
            return NextResponse.json({ plan_type: "free", last_event_at: null });
        }
        return NextResponse.json(result.rows[0]);
    }

    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
}

export async function POST(req: NextRequest) {
    await initDb();

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !isAdmin(authHeader)) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const { event_id, event_name } = body;

    if (!event_id || !event_name) {
        return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    await db.query(
        `INSERT INTO processed_webhooks (event_id, event_name)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING`,
        [event_id, event_name]
    );

    return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../db";
import { isAdmin } from "../../../lib/auth";

/**
 * POST /api/subscription-event
 * 구독 이벤트 감사 로그 기록
 */
export async function POST(req: NextRequest) {
    await initDb();

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !isAdmin(authHeader)) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const { user_id, event_type, plan_before, plan_after, raw_data, event_source } = body;

    if (!user_id || !event_type) {
        return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    await db.query(
        `INSERT INTO subscription_events (user_id, event_type, event_source, plan_before, plan_after, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user_id, event_type, event_source || "webhook", plan_before || null, plan_after || null,
         raw_data ? JSON.stringify(raw_data) : null]
    );

    return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { initDb } from "../../../db";
import { requireAuth, getQuotaStatus } from "../../../../lib/requireAuth";

/**
 * GET /api/user/quota
 * 오늘 번역/소설 쿼터 현황 반환
 */
export async function GET(req: NextRequest) {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const userId = authResult;

    await initDb();

    const quota = await getQuotaStatus(userId);
    return NextResponse.json(quota);
}

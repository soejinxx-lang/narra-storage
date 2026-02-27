import { NextRequest, NextResponse } from "next/server";
import db from "../app/db";
import { getUserIdFromToken } from "./auth";

/**
 * 로그인 필수 미들웨어 (듀얼 모드)
 * 1️⃣ HttpOnly 쿠키 우선 (session)
 * 2️⃣ Bearer 헤더 폴백 (전환기 호환)
 *
 * 성공: userId (string) 반환
 * 실패: 401 NextResponse 반환
 */
export async function requireAuth(req: NextRequest): Promise<string | NextResponse> {
    // 1️⃣ HttpOnly 쿠키 우선
    const cookieToken = req.cookies.get("session")?.value;
    if (cookieToken) {
        const userId = await getUserIdFromToken(`Bearer ${cookieToken}`);
        if (userId) return userId;
    }

    // 2️⃣ Bearer 헤더 폴백
    const authHeader = req.headers.get("Authorization");
    const userId = await getUserIdFromToken(authHeader);
    if (!userId) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    return userId;
}

/**
 * 소유자 OR Admin 확인 미들웨어
 * 성공: userId (string) 반환
 * 실패: 401 / 403 NextResponse 반환
 */
export async function requireOwnerOrAdmin(
    req: NextRequest,
    novelId: string
): Promise<string | NextResponse> {
    const authHeader = req.headers.get("Authorization");
    const userId = await getUserIdFromToken(authHeader);

    if (!userId) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // Admin API Key → 항상 통과
    if (
        process.env.ADMIN_API_KEY &&
        authHeader === `Bearer ${process.env.ADMIN_API_KEY}`
    ) {
        return userId;
    }

    // role='admin' 유저 → 통과
    const adminCheck = await db.query(
        `SELECT role FROM users WHERE id = $1`,
        [userId]
    );
    if (adminCheck.rows[0]?.role === 'admin') {
        return userId;
    }

    // 소설 소유자 확인
    const novelCheck = await db.query(
        `SELECT author_id FROM novels WHERE id = $1`,
        [novelId]
    );

    if (novelCheck.rows.length === 0) {
        return NextResponse.json({ error: "NOVEL_NOT_FOUND" }, { status: 404 });
    }

    if (novelCheck.rows[0].author_id !== userId) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    return userId;
}

/**
 * KST 기준 오늘 날짜 (YYYY-MM-DD)
 */
export function getKSTDate(): string {
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return kst.toISOString().slice(0, 10);
}

/**
 * KST 자정까지 남은 초
 */
export function getSecondsUntilKSTMidnight(): number {
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const tomorrow = new Date(kst);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return Math.floor((tomorrow.getTime() - kst.getTime()) / 1000);
}

/**
 * 번역 쿼터 atomic 차감
 * 성공: true
 * 실패(쿼터 초과): { remaining: 0, resetIn: seconds }
 */
export async function consumeTranslationQuota(
    userId: string
): Promise<true | { remaining: number; resetIn: number }> {
    const today = getKSTDate();
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        // 0. 유저 플랜에서 limit 조회 (없으면 기본값 3)
        const planRow = await client.query(
            `SELECT translation_limit FROM user_plans WHERE user_id = $1`,
            [userId]
        );
        const maxPerDay = planRow.rows[0]?.translation_limit ?? 3;

        // 1. row 없으면 INSERT (ON CONFLICT DO NOTHING으로 race condition 방지)
        await client.query(
            `INSERT INTO translation_quota (user_id, date, used)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id, date) DO NOTHING`,
            [userId, today]
        );

        // 2. SELECT FOR UPDATE (행 잠금 — 동시 요청 직렬화)
        const row = await client.query(
            `SELECT used FROM translation_quota
       WHERE user_id = $1 AND date = $2
       FOR UPDATE`,
            [userId, today]
        );

        const used = row.rows[0]?.used ?? 0;

        if (used >= maxPerDay) {
            await client.query("ROLLBACK");
            return { remaining: 0, resetIn: getSecondsUntilKSTMidnight() };
        }

        // 3. 차감
        await client.query(
            `UPDATE translation_quota SET used = used + 1
       WHERE user_id = $1 AND date = $2`,
            [userId, today]
        );

        await client.query("COMMIT");
        return true;
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}

/**
 * 번역 쿼터 환불 (번역 실패 시)
 * used가 0 이하로 내려가지 않도록 음수 방어
 */
export async function refundTranslationQuota(userId: string): Promise<void> {
    const today = getKSTDate();
    await db.query(
        `UPDATE translation_quota
     SET used = GREATEST(0, used - 1)
     WHERE user_id = $1 AND date = $2`,
        [userId, today]
    );
}

/**
 * 소설 생성 쿼터 atomic 차감 (번역 쿼터와 분리)
 */
export async function consumeNovelQuota(
    userId: string,
    maxPerDay = 3
): Promise<true | { remaining: number; resetIn: number }> {
    const today = getKSTDate();
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO novel_quota (user_id, date, used)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id, date) DO NOTHING`,
            [userId, today]
        );

        const row = await client.query(
            `SELECT used FROM novel_quota
       WHERE user_id = $1 AND date = $2
       FOR UPDATE`,
            [userId, today]
        );

        const used = row.rows[0]?.used ?? 0;

        if (used >= maxPerDay) {
            await client.query("ROLLBACK");
            return { remaining: 0, resetIn: getSecondsUntilKSTMidnight() };
        }

        await client.query(
            `UPDATE novel_quota SET used = used + 1
       WHERE user_id = $1 AND date = $2`,
            [userId, today]
        );

        await client.query("COMMIT");
        return true;
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}

/**
 * 쿼터 현황 조회 (GET용)
 */
export async function getQuotaStatus(userId: string): Promise<{
    translation: { used: number; remaining: number; resetIn: number };
    novel: { used: number; remaining: number; resetIn: number };
}> {
    const today = getKSTDate();
    const resetIn = getSecondsUntilKSTMidnight();

    const [tq, nq] = await Promise.all([
        db.query(
            `SELECT used FROM translation_quota WHERE user_id = $1 AND date = $2`,
            [userId, today]
        ),
        db.query(
            `SELECT used FROM novel_quota WHERE user_id = $1 AND date = $2`,
            [userId, today]
        ),
    ]);

    const tUsed = tq.rows[0]?.used ?? 0;
    const nUsed = nq.rows[0]?.used ?? 0;

    return {
        translation: { used: tUsed, remaining: Math.max(0, 3 - tUsed), resetIn },
        novel: { used: nUsed, remaining: Math.max(0, 3 - nUsed), resetIn },
    };
}

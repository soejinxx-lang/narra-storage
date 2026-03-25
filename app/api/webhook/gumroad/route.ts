import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../db";
import { PLAN_QUOTAS } from "../../../../lib/plans";
import type { PlanType } from "../../../../lib/plans";

/**
 * Gumroad product_id → plan 매핑 (Single Source of Truth)
 *
 * ⚠️ 배포 전 반드시 실제 Gumroad product_id로 교체!
 * Gumroad Dashboard → 상품 클릭 → URL의 product_id 확인
 * 또는 API: GET https://api.gumroad.com/v2/products
 */
const GUMROAD_PLAN_MAP: Record<string, { plan: PlanType; cycle: "monthly" | "yearly" }> = {
    // TODO: 실제 Gumroad product_id로 교체
    "READER_PLUS_MONTHLY_ID": { plan: "reader_premium", cycle: "monthly" },
    "READER_PLUS_ANNUAL_ID": { plan: "reader_premium", cycle: "yearly" },
    "AUTHOR_STARTER_MONTHLY_ID": { plan: "author_starter", cycle: "monthly" },
    "AUTHOR_STARTER_ANNUAL_ID": { plan: "author_starter", cycle: "yearly" },
    "AUTHOR_PRO_MONTHLY_ID": { plan: "author_pro", cycle: "monthly" },
    "AUTHOR_PRO_ANNUAL_ID": { plan: "author_pro", cycle: "yearly" },
};

/** permalink 기반 fallback 매핑 (product_id 못 찾을 경우) */
const PERMALINK_MAP: Record<string, { plan: PlanType; cycle: "monthly" | "yearly" }> = {
    "ReaderPlusMonthly": { plan: "reader_premium", cycle: "monthly" },
    "ReaderPlusAnnual": { plan: "reader_premium", cycle: "yearly" },
    "AuthorStarterMonthly": { plan: "author_starter", cycle: "monthly" },
    "AuthorStarterAnnual": { plan: "author_starter", cycle: "yearly" },
    "AuthorProMonthly": { plan: "author_pro", cycle: "monthly" },
    "AuthorProAnnual": { plan: "author_pro", cycle: "yearly" },
};

/** recurrence → 만료일 계산 */
function calculateExpiresAt(from: Date, cycle: "monthly" | "yearly"): Date {
    const d = new Date(from);
    if (cycle === "yearly") {
        d.setFullYear(d.getFullYear() + 1);
    } else {
        d.setMonth(d.getMonth() + 1);
    }
    // 여유 3일 (grace period)
    d.setDate(d.getDate() + 3);
    return d;
}

/**
 * POST /api/webhook/gumroad
 *
 * Gumroad Ping (webhook) 수신 엔드포인트
 * - form-encoded POST
 * - 이벤트: sale, subscription_updated, subscription_ended,
 *           subscription_cancelled, refunded, dispute
 */
export async function POST(req: NextRequest) {
    await initDb();

    // Gumroad은 form-encoded로 전송
    const formData = await req.formData();
    const data: Record<string, string> = {};
    formData.forEach((value: FormDataEntryValue, key: string) => {
        data[key] = value.toString();
    });

    // ── 1. seller_id 검증 ──
    const expectedSellerId = process.env.GUMROAD_SELLER_ID;
    if (expectedSellerId && data.seller_id !== expectedSellerId) {
        console.error("[Gumroad Webhook] seller_id mismatch:", data.seller_id);
        return NextResponse.json({ error: "INVALID_SELLER" }, { status: 403 });
    }

    // ── 2. 이벤트 정보 추출 ──
    const resourceName = data.resource_name; // sale, subscription_updated, etc.
    const saleId = data.sale_id || data.subscription_id || `gumroad_${Date.now()}`;
    const productId = data.product_id || "";
    const productPermalink = data.product_permalink || data.permalink || "";
    const subscriptionId = data.subscription_id || "";
    const recurrence = data.recurrence || ""; // monthly, yearly
    const eventTimestamp = data.sale_timestamp || new Date().toISOString();

    console.log(`[Gumroad Webhook] ${resourceName} | product=${productId} | sub=${subscriptionId}`);

    // ── 3. 유저 식별 (2단계 fallback) ──
    // 1순위: custom_fields[user_id]
    let userId = data["custom_fields[user_id]"] || data["url_params[user_id]"] || "";

    // Gumroad은 custom_fields를 다양한 형태로 전달할 수 있음
    if (!userId) {
        // custom_fields가 JSON으로 올 수도 있음
        for (const [key, value] of Object.entries(data)) {
            if (key.includes("user_id") && value) {
                userId = value;
                break;
            }
        }
    }

    // 2순위: email fallback
    if (!userId && data.email) {
        const emailResult = await db.query(
            `SELECT id FROM users WHERE username = $1 OR name = $1 LIMIT 1`,
            [data.email]
        );
        if (emailResult.rows.length > 0) {
            userId = emailResult.rows[0].id;
        }
    }

    if (!userId) {
        console.error("[Gumroad Webhook] 유저 식별 불가:", {
            custom_fields: data["custom_fields[user_id]"],
            email: data.email,
        });
        // 200 리턴 (Gumroad이 재시도하지 않도록)
        return NextResponse.json({ error: "USER_NOT_FOUND", received: true });
    }

    // ── 4. 플랜 매핑 (product_id 우선 → permalink fallback) ──
    let planInfo = GUMROAD_PLAN_MAP[productId];
    if (!planInfo) {
        planInfo = PERMALINK_MAP[productPermalink];
    }

    // recurrence으로 cycle 보정
    const cycle = (recurrence === "yearly" || recurrence === "annually")
        ? "yearly" as const
        : planInfo?.cycle || "monthly" as const;

    // ── 5. 이벤트별 처리 (트랜잭션) ──
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        // idempotency: 중복 이벤트 체크
        const dupCheck = await client.query(
            `INSERT INTO processed_webhooks (event_id, event_name)
             VALUES ($1, $2)
             ON CONFLICT (event_id) DO NOTHING
             RETURNING event_id`,
            [saleId, resourceName || "gumroad_ping"]
        );

        if (dupCheck.rowCount === 0) {
            // 이미 처리된 이벤트
            await client.query("ROLLBACK");
            console.log(`[Gumroad Webhook] 중복 이벤트 무시: ${saleId}`);
            return NextResponse.json({ ok: true, duplicate: true });
        }

        // stale 이벤트 방지: last_event_at 비교
        const currentPlan = await client.query(
            `SELECT plan_type, last_event_at, gumroad_subscription_id FROM user_plans WHERE user_id = $1`,
            [userId]
        );
        const existingEventAt = currentPlan.rows[0]?.last_event_at;
        if (existingEventAt && new Date(eventTimestamp) < new Date(existingEventAt)) {
            await client.query("ROLLBACK");
            console.log(`[Gumroad Webhook] stale 이벤트 무시: ${eventTimestamp} < ${existingEventAt}`);
            return NextResponse.json({ ok: true, stale: true });
        }

        // 이벤트 유형별 처리
        switch (resourceName) {
            case "sale":
            case "subscription_updated":
            case "subscription_restarted": {
                // 구독 활성화 / 갱신
                if (!planInfo) {
                    console.error("[Gumroad Webhook] 알 수 없는 product:", productId, productPermalink);
                    await client.query("ROLLBACK");
                    return NextResponse.json({ error: "UNKNOWN_PRODUCT", received: true });
                }

                const quota = PLAN_QUOTAS[planInfo.plan];
                const existingExpires = currentPlan.rows[0]?.expires_at;
                const baseDate = (existingExpires && new Date(existingExpires) > new Date())
                    ? new Date(existingExpires)  // 기존 만료일 기준 누적 연장
                    : new Date();                // 신규 or 만료됨 → 지금부터
                const expiresAt = calculateExpiresAt(baseDate, cycle);

                await client.query(
                    `INSERT INTO user_plans (
                        user_id, plan_type, translation_limit, novel_limit, entity_extract_limit,
                        gumroad_product_id, gumroad_subscription_id,
                        expires_at, plan_status, plan_source, last_event_at, started_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 'gumroad', $9, NOW())
                    ON CONFLICT (user_id) DO UPDATE SET
                        plan_type = $2,
                        translation_limit = $3,
                        novel_limit = $4,
                        entity_extract_limit = $5,
                        gumroad_product_id = COALESCE($6, user_plans.gumroad_product_id),
                        gumroad_subscription_id = COALESCE($7, user_plans.gumroad_subscription_id),
                        expires_at = $8,
                        plan_status = 'active',
                        plan_source = 'gumroad',
                        last_event_at = $9`,
                    [
                        userId, planInfo.plan,
                        quota.translation, quota.novel, quota.entity,
                        productId || null, subscriptionId || null,
                        expiresAt, eventTimestamp,
                    ]
                );
                console.log(`[Gumroad Webhook] ✅ ${planInfo.plan} 활성화 | user=${userId} | expires=${expiresAt.toISOString()}`);
                break;
            }

            case "subscription_cancelled": {
                // 취소됨 — grace period 유지 (expires_at까지는 사용 가능)
                await client.query(
                    `UPDATE user_plans SET plan_status = 'cancelled', last_event_at = $2
                     WHERE user_id = $1`,
                    [userId, eventTimestamp]
                );
                console.log(`[Gumroad Webhook] ⚠️ 구독 취소 | user=${userId} (grace period 유지)`);
                break;
            }

            case "subscription_ended": {
                // 구독 종료 — free로 다운그레이드
                const freeQuota = PLAN_QUOTAS.free;
                await client.query(
                    `UPDATE user_plans SET
                        plan_type = 'free', plan_status = 'expired',
                        translation_limit = $2, novel_limit = $3, entity_extract_limit = $4,
                        last_event_at = $5
                     WHERE user_id = $1`,
                    [userId, freeQuota.translation, freeQuota.novel, freeQuota.entity, eventTimestamp]
                );
                console.log(`[Gumroad Webhook] ❌ 구독 종료 → free | user=${userId}`);
                break;
            }

            case "refunded":
            case "dispute":
            case "chargebacked": {
                // 환불/분쟁 — 즉시 free 다운그레이드
                const freeQuota2 = PLAN_QUOTAS.free;
                await client.query(
                    `UPDATE user_plans SET
                        plan_type = 'free', plan_status = 'refunded',
                        translation_limit = $2, novel_limit = $3, entity_extract_limit = $4,
                        last_event_at = $5
                     WHERE user_id = $1`,
                    [userId, freeQuota2.translation, freeQuota2.novel, freeQuota2.entity, eventTimestamp]
                );
                console.log(`[Gumroad Webhook] 🔴 환불/분쟁 → free | user=${userId}`);
                break;
            }

            default:
                console.log(`[Gumroad Webhook] 미처리 이벤트: ${resourceName}`);
        }

        // 감사 로그
        await client.query(
            `INSERT INTO subscription_events (user_id, event_type, event_source, plan_before, plan_after, raw_data, received_at)
             VALUES ($1, $2, 'gumroad', $3, $4, $5, NOW())`,
            [
                userId,
                resourceName || "unknown",
                currentPlan.rows[0]?.plan_type || "free",
                planInfo?.plan || "free",
                JSON.stringify(data),
            ]
        );

        await client.query("COMMIT");
        return NextResponse.json({ ok: true });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("[Gumroad Webhook] 처리 실패:", error);
        return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    } finally {
        client.release();
    }
}

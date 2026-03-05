/**
 * Plan 상수 정의 — 결제 시스템의 single source of truth
 * narra-storage 전역에서 import하여 사용
 */

export const PLAN_TYPES = {
    FREE: "free",
    READER_PLUS: "reader_premium",
    AUTHOR_STARTER: "author_starter",
    AUTHOR_PRO: "author_pro",
} as const;

export type PlanType = (typeof PLAN_TYPES)[keyof typeof PLAN_TYPES];

/** Plan별 일일 쿼터 */
export const PLAN_QUOTAS: Record<
    PlanType,
    { novel: number; translation: number; entity: number }
> = {
    free: { novel: 3, translation: 3, entity: 5 },
    reader_premium: { novel: 3, translation: 3, entity: 5 },
    author_starter: { novel: 10, translation: 15, entity: 20 },
    author_pro: { novel: 999, translation: 999, entity: 999 },
};

/** Plan 우선순위 (upgrade/downgrade 판단용) */
export const PLAN_RANK: Record<PlanType, number> = {
    free: 0,
    reader_premium: 1,
    author_starter: 2,
    author_pro: 3,
};

/** Plan이 유효한 값인지 검증 */
export function isValidPlan(plan: string): plan is PlanType {
    return Object.values(PLAN_TYPES).includes(plan as PlanType);
}

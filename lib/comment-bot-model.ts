/**
 * Comment Bot Model — 공유 계산 모듈
 *
 * 워커(worker/index.ts)와 대시보드(comment-stats/route.ts)가 함께 import.
 * 계산 로직이 한 곳에만 있어 항상 동일한 botTarget이 나온다.
 *
 * 상태(viewsCache)는 워커만 유지하고,
 * DB에서 읽는 views_eff를 통해 대시보드도 동일한 값을 사용한다.
 */

// ── 모델 파라미터 (워커·대시보드 동기화) ──
export const MODEL_PARAMS = {
    ENGAGEMENT_RATE: 0.05,
    CUM_BOT_RATIO: 0.6,
    MAX_COMMENT_CAP_BASE: 300,
    CUM_LAMBDA: 0.4,
    CUM_T0: 0.3,
    VIEW_DRIFT_MAX_MULTIPLIER: 1.3,
    BACKFILL_ENTRY_THRESHOLD: 0.8,
    BACKFILL_EXIT_THRESHOLD: 0.9,
    ONGOING_CYCLE_FACTOR: 0.15,
    MAX_BACKFILL_PER_EPISODE: 40,
} as const;

/**
 * 소설 품질 잠재변수 Q (log-normal + drift)
 * novelId 해시 기반 — 동일 novelId이면 항상 동일한 Q 반환 (stateless)
 */
export function generateNovelQ(novelId: string): number {
    let h = 0;
    for (let i = 0; i < novelId.length; i++) {
        h = ((h << 5) - h + novelId.charCodeAt(i)) | 0;
    }
    const hash = Math.abs(h);
    const u1 = ((hash % 10000) + 1) / 10001;
    const u2 = (((hash * 7919) % 10000) + 1) / 10001;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const base = Math.exp(-0.15 + 0.45 * z);

    // 느린 drift: 월 단위 ±5%
    const monthsSinceEpoch = Math.floor(Date.now() / (30 * 86400000));
    const drift = Math.sin(hash + monthsSinceEpoch * 0.3) * 0.05;

    return Math.max(0.2, Math.min(3.0, base + drift));
}

/**
 * 봇 target 계산 (순수 함수 — stateless)
 *
 * @param views_eff  댐핑된 조회수 (워커: getViewsEff 결과, 대시보드: DB에 저장된 값)
 * @param epNumber   에피소드 번호 (1-based)
 * @param daysSince  업로드 후 경과 일수
 * @returns          봇이 채워야 할 누적 댓글 수
 */
export function calcBotTarget(
    views_eff: number,
    epNumber: number,
    daysSince: number
): number {
    if (views_eff <= 0) return 0;

    const {
        ENGAGEMENT_RATE,
        CUM_BOT_RATIO,
        MAX_COMMENT_CAP_BASE,
        CUM_LAMBDA,
        CUM_T0,
    } = MODEL_PARAMS;

    // ep-index 감쇠 (ep1=1.0, ep10=0.53, ep20=0.32)
    const D = 1 / (1 + 0.08 * Math.max(0, epNumber - 1));
    const cap = MAX_COMMENT_CAP_BASE * D;

    const C_max = Math.min(ENGAGEMENT_RATE * views_eff * D, cap);
    const saturation = 1 - Math.exp(-CUM_LAMBDA * (daysSince + CUM_T0));
    const totalTarget = C_max * saturation;

    const minBot = daysSince < 0.1 ? 1 : 0;
    return Math.max(minBot, Math.floor(totalTarget * CUM_BOT_RATIO));
}

/**
 * C_max (engagement ceiling) — 대시보드 display용
 */
export function calcCMax(views_eff: number, epNumber: number): number {
    const D = 1 / (1 + 0.08 * Math.max(0, epNumber - 1));
    const cap = MODEL_PARAMS.MAX_COMMENT_CAP_BASE * D;
    return Math.min(MODEL_PARAMS.ENGAGEMENT_RATE * views_eff * D, cap);
}

/**
 * ep-index 감쇠 D
 */
export function calcD(epNumber: number): number {
    return 1 / (1 + 0.08 * Math.max(0, epNumber - 1));
}

/**
 * saturation (시간 기반 누적률)
 */
export function calcSaturation(daysSince: number): number {
    return 1 - Math.exp(-MODEL_PARAMS.CUM_LAMBDA * (daysSince + MODEL_PARAMS.CUM_T0));
}

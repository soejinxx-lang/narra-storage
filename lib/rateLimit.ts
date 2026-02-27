/**
 * 간단한 in-memory rate limiter.
 *
 * ⚠️ 한계:
 * - 서버리스 환경(Railway, Vercel)에서 인스턴스별 메모리 독립
 * - 재시작 시 초기화
 * - 다중 인스턴스 환경에서 무력화
 *
 * 프로덕션 레벨은 Redis/Upstash 기반이 이상적이지만
 * 현재 규모에서는 단일 인스턴스 방어용으로 충분.
 */

const requests = new Map<string, { count: number; resetAt: number }>();

// 메모리 누수 방지: 5분마다 만료된 항목 정리
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of requests) {
        if (now > entry.resetAt) requests.delete(key);
    }
}, 5 * 60 * 1000);

export function rateLimit(
    key: string,
    maxRequests: number = 60,
    windowSec: number = 60
): boolean {
    const now = Date.now();
    const entry = requests.get(key);

    if (!entry || now > entry.resetAt) {
        requests.set(key, { count: 1, resetAt: now + windowSec * 1000 });
        return true;
    }

    if (entry.count >= maxRequests) return false;
    entry.count++;
    return true;
}

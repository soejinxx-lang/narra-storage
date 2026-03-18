/**
 * sms-digest.ts — 하루 4회 어드민 현황 SMS 발송 (CoolSMS)
 *
 * 발송 시각 (KST): 00:00 / 06:00 / 12:00 / 18:00
 * 환경변수: COOLSMS_API_KEY, COOLSMS_API_SECRET, SMS_FROM, SMS_TO
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto');
import db from '../app/db.js';

// ─── CoolSMS 발송 ───────────────────────────────────────────────
async function sendCoolSMS(text: string): Promise<void> {
    const apiKey = process.env.COOLSMS_API_KEY;
    const apiSecret = process.env.COOLSMS_API_SECRET;
    const from = process.env.SMS_FROM; // 발신번호 (인증된 번호)
    const to = process.env.SMS_TO;   // 수신번호

    if (!apiKey || !apiSecret || !from || !to) {
        console.warn('[SMS] ⚠️ COOLSMS env vars missing, skipping');
        return;
    }

    // HMAC-SHA256 서명 (CoolSMS v4)
    const date = new Date().toISOString();
    const salt = Math.random().toString(36).slice(2);
    const sigInput = `${date}${salt}`;

    const signature = crypto.createHmac('sha256', apiSecret).update(sigInput).digest('hex');

    const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

    const body = JSON.stringify({
        message: { to, from, text, type: 'SMS' },
    });

    const res = await fetch('https://api.solapi.com/messages/v4/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
        },
        body,
    });

    if (!res.ok) {
        const err = await res.text();
        console.error(`[SMS] ❌ CoolSMS error: ${res.status} → ${err.slice(0, 200)}`);
    } else {
        console.log('[SMS] ✅ Digest sent');
    }
}

// ─── 통계 수집 ───────────────────────────────────────────────────
async function gatherStats(): Promise<string> {
    const now = new Date();
    const kstHour = ((now.getUTCHours() + 9) % 24).toString().padStart(2, '0');

    // ① 지난 6시간 LLM 통계
    const llmResult = await db.query(`
        SELECT
            COUNT(*)                                        AS total,
            SUM(CASE WHEN success THEN 1 ELSE 0 END)       AS ok,
            ROUND(AVG(latency_ms))                         AS avg_ms
        FROM llm_call_log
        WHERE created_at >= NOW() - INTERVAL '6 hours'
    `);
    const llm = llmResult.rows[0];
    const total = parseInt(llm.total) || 0;
    const ok = parseInt(llm.ok) || 0;
    const avgMs = parseInt(llm.avg_ms) || 0;
    const successRate = total > 0 ? Math.round((ok / total) * 100) : 100;

    // ② 봇 댓글 현황 (전체 평균 충전율)
    const botResult = await db.query(`
        SELECT
            COUNT(DISTINCT e.id)                               AS ep_count,
            COALESCE(SUM(e.bot_target), 0)                    AS total_target,
            COALESCE(SUM(bc.bot_cnt), 0)                      AS total_actual
        FROM episodes e
        JOIN novels n ON e.novel_id = n.id
        LEFT JOIN (
            SELECT c.episode_id, COUNT(*) AS bot_cnt
            FROM comments c JOIN users u ON c.user_id = u.id
            WHERE u.role = 'bot'
            GROUP BY c.episode_id
        ) bc ON bc.episode_id = e.id
        WHERE e.status = 'published' AND n.deleted_at IS NULL
    `);
    const bot = botResult.rows[0];
    const epCount = parseInt(bot.ep_count) || 0;
    const totalTarget = parseInt(bot.total_target) || 0;
    const totalActual = parseInt(bot.total_actual) || 0;
    const fillRate = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    // ③ 지난 6시간 신규 봇 댓글 수
    const recentResult = await db.query(`
        SELECT COUNT(*) AS cnt
        FROM comments c JOIN users u ON c.user_id = u.id
        WHERE u.role = 'bot' AND c.created_at >= NOW() - INTERVAL '6 hours'
    `);
    const recentAdded = parseInt(recentResult.rows[0]?.cnt) || 0;

    // ④ LLM 에러
    const errResult = await db.query(`
        SELECT COUNT(*) AS errs
        FROM llm_call_log
        WHERE success = false AND created_at >= NOW() - INTERVAL '6 hours'
    `);
    const errors = parseInt(errResult.rows[0]?.errs) || 0;

    const errMark = errors > 5 ? ' ⚠️' : '';
    const fillMark = fillRate < 70 ? ' 🔴' : fillRate < 85 ? ' 🟡' : ' ✅';

    return [
        `[Narra ${kstHour}시 현황]`,
        `봇댓글 충전율: ${fillRate}%${fillMark} (${totalActual}/${totalTarget})`,
        `에피소드: ${epCount}개`,
        `최근 6h 추가: +${recentAdded}개`,
        `LLM 성공률: ${successRate}% (${ok}/${total})`,
        `평균응답: ${avgMs}ms${errMark}`,
        errors > 0 ? `LLM 에러: ${errors}건` : '',
    ].filter(Boolean).join('\n');
}

// ─── KST 기준 발送 시각 체크 ──────────────────────────────────────
const DIGEST_HOURS_KST = [0, 6, 12, 18];
let lastDigestHour = -1; // 같은 시각에 중복 발送 방지
let lastDebugKey = '';   // 디버깅 로그 throttle

export async function checkAndSendDigest(): Promise<void> {
    const nowKST = new Date(Date.now() + 9 * 3600 * 1000);
    const hourKST = nowKST.getUTCHours();
    const minKST = nowKST.getUTCMinutes();

    // 디버깅: 10분에 한 번만 로그 (throttle)
    const debugKey = `${hourKST}:${Math.floor(minKST / 10)}`;
    if (debugKey !== lastDebugKey) {
        lastDebugKey = debugKey;
        console.log(`[SMS-DEBUG] KST=${hourKST}:${String(minKST).padStart(2,'0')} targets=[${DIGEST_HOURS_KST}] lastSent=${lastDigestHour}`);
    }

    // 지정 시각의 첫 5분 안에만 실행, 같은 시각 중복 발送 방지
    if (!DIGEST_HOURS_KST.includes(hourKST)) return;
    if (minKST >= 5) return;
    if (lastDigestHour === hourKST) return;

    console.log(`[SMS] 🔔 Digest 발송 시작 (KST ${hourKST}:${String(minKST).padStart(2,'0')})`);
    lastDigestHour = hourKST;

    try {
        const text = await gatherStats();
        console.log('[SMS] 📊 Digest:\n' + text);
        await sendCoolSMS(text);
    } catch (err) {
        console.error('[SMS] ❌ digest error:', err);
    }
}

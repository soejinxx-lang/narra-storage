/**
 * 다국어 댓글봇 엔진 — engine.ts
 * 
 * 한국어 route.ts의 구조를 정확히 따름.
 * 숫자/구조 로직은 여기, 문자열 로직은 LanguagePack.
 * 
 * 7-Stage Pipeline:
 *   1. Event Extraction (GPT)
 *   1.5. Genre-based Persona Selection
 *   2. Reader Profiles
 *   3. Info Restriction + 왜곡
 *   4. Comment Generation (4+1 GPT calls)
 *   5. Herd Effect (집단 동조)
 *   6. Emotion Amplification
 *   7. GPT-5 Curator
 * 
 * + 70/20/10 비율 시스템
 * + 봇 생성 & 댓글 작성
 */

import crypto from 'crypto';
import db from "../../../db";
import type {
    LanguagePack,
    PersonalityTone,
    StoryEvent,
    EventExtraction,
    ReaderProfile,
    PersonaDef,
    CallPromptArgs,
    CommentBotResult,
} from "./types";

// ============================================================
// 장르 → 상위 카테고리 매핑 (언어 무관 — 공유)
// ============================================================
const GENRE_CATEGORY_MAP: Record<string, string> = {
    'High Fantasy': 'fantasy', 'Dark Fantasy': 'fantasy',
    'Urban Fantasy': 'fantasy', 'Mythology Retelling': 'fantasy',
    'GameLit / LitRPG': 'game-fantasy', 'Cultivation': 'game-fantasy',
    'Progression': 'game-fantasy', 'Dungeon / Tower': 'game-fantasy',
    'Murim': 'murim', 'Martial Arts': 'murim',
    'Contemporary Romance': 'romance', 'Historical Romance': 'romance',
    'Romantic Fantasy': 'romance', 'Paranormal Romance': 'romance',
    'Romantic Comedy': 'romance', 'CEO / Billionaire': 'romance',
    'Enemies to Lovers': 'romance', 'Forbidden Love': 'romance',
    'Omegaverse': 'romance', 'Slow Burn': 'romance',
    'Isekai': 'regression', 'Regression': 'regression',
    'Reincarnation': 'regression', 'Transmigration': 'regression',
    'Time Travel': 'regression',
    'Space Opera': 'scifi', 'Cyberpunk': 'scifi', 'Steampunk': 'scifi',
    'Post-Apocalyptic': 'scifi', 'Hard Sci-Fi': 'scifi',
    'Mecha': 'scifi', 'Virtual Reality': 'scifi',
    'Psychological Thriller': 'mystery', 'Crime': 'mystery',
    'Detective': 'mystery', 'Cozy Mystery': 'mystery',
    'Revenge': 'mystery', 'Espionage': 'mystery', 'Whodunit': 'mystery',
    'Supernatural Horror': 'horror', 'Cosmic Horror': 'horror',
    'Gothic': 'horror', 'Psychological Horror': 'horror',
    'Zombie': 'horror', 'Gothic Horror': 'horror',
    'Supernatural': 'horror', 'Survival Horror': 'horror',
    'Body Horror': 'horror', 'Folk Horror': 'horror',
    'Historical Fiction': 'historical', 'Alternate History': 'historical',
    'Period Drama': 'historical', 'War': 'historical',
    'Historical Fantasy': 'historical', 'Court Intrigue': 'historical',
    'War Epic': 'historical', 'Dynasty': 'historical',
    'Slice of Life': 'slice-of-life', 'Coming of Age': 'slice-of-life',
    'Tragedy': 'slice-of-life', 'School Life': 'slice-of-life',
    'Workplace': 'slice-of-life', 'Family': 'slice-of-life',
    'Contemporary': 'slice-of-life', 'Family Drama': 'slice-of-life',
    'Melodrama': 'slice-of-life',
    'Superhero': 'action', 'Military': 'action',
    'Survival': 'action', 'Apocalypse': 'action',
    'Apocalyptic': 'action', 'Battle Royale': 'action', 'Sports': 'action',
    'Satire': 'comedy', 'Parody': 'comedy',
    'Slapstick': 'comedy', 'Dark Comedy': 'comedy',
};

// ============================================================
// 장르별 페르소나 풀 매핑 (구조 동일, 언어 무관)
// ============================================================
const GENRE_PERSONA_MAP: Record<string, string[]> = {
    // Deep context test: more C(chaos) + D(analyst) for energy diversity, fewer A/B(excited)
    'fantasy': ['A1', 'A2', 'A5', 'B1', 'B6', 'C1', 'C3', 'C4', 'C5', 'D1', 'D2', 'D3', 'D5', 'E1', 'E2', 'E5'],
    'game-fantasy': ['A1', 'A4', 'B1', 'B4', 'C1', 'C2', 'C3', 'C5', 'D1', 'D2', 'D3', 'D5', 'E1', 'E2', 'E5'],
    'murim': ['A1', 'A4', 'B1', 'C1', 'C2', 'C3', 'C5', 'D1', 'D3', 'E1', 'E2', 'E5'],
    'romance': ['A1', 'A3', 'A7', 'B6', 'C1', 'C3', 'C4', 'C5', 'D1', 'D2', 'D4', 'E2', 'E3', 'E5'],
    'scifi': ['A2', 'B1', 'B4', 'C1', 'C3', 'C5', 'D1', 'D3', 'D4', 'E2', 'E5'],
    'mystery': ['A1', 'B1', 'B6', 'C3', 'C5', 'D1', 'D3', 'D4', 'E2', 'E5'],
    'horror': ['A1', 'A6', 'C1', 'C3', 'C5', 'D1', 'D5', 'E2', 'E5'],
    'historical': ['A2', 'A5', 'B5', 'C3', 'C5', 'D1', 'D4', 'E2', 'E5'],
    'slice-of-life': ['A1', 'A7', 'C3', 'C4', 'C5', 'D1', 'D4', 'E2', 'E5'],
    'action': ['A4', 'B1', 'C1', 'C2', 'C3', 'C5', 'D1', 'D3', 'E1', 'E2', 'E5'],
    'comedy': ['A1', 'C1', 'C3', 'C4', 'C5', 'D1', 'D4', 'E1', 'E2', 'E5'],
    'regression': ['A4', 'A5', 'B1', 'C2', 'C3', 'C5', 'D1', 'D2', 'D3', 'E1', 'E2', 'E5'],
};

// ============================================================
// 유틸리티 함수 (한국어 route.ts 동일)
// ============================================================

export function weightedRandom<T>(items: { item: T; weight: number }[]): T {
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of items) {
        if (random < item.weight) return item.item;
        random -= item.weight;
    }
    return items[items.length - 1].item;
}

function pickPersonalityTone(weights: { tone: PersonalityTone; weight: number }[]): PersonalityTone {
    return weightedRandom(weights.map(pw => ({ item: pw.tone, weight: pw.weight })));
}

function pickCommentCount(weights: { count: number; weight: number }[]): number {
    return weightedRandom(weights.map(cw => ({ item: cw.count, weight: cw.weight })));
}

function pickNickname(pool: string[], usedNicknames: Set<string>): string {
    const available = pool.filter(n => !usedNicknames.has(n));
    if (available.length === 0) {
        // 풀 소진 시: 중복 없을 때까지 반복 시도
        let nn: string;
        let attempts = 0;
        do {
            const base = pool[Math.floor(Math.random() * pool.length)];
            const suffix = Math.floor(Math.random() * 9999) + 1;
            nn = `${base}_${suffix}`;
            attempts++;
        } while (usedNicknames.has(nn) && attempts < 100);
        usedNicknames.add(nn);
        return nn;
    }
    const selected = available[Math.floor(Math.random() * available.length)];
    usedNicknames.add(selected);
    return selected;
}

// ============================================================
// #1 현실적 username 생성 (닉네임 파생, 다양한 스타일)
// ============================================================
function generateRealisticUsername(nickname: string): string {
    const clean = nickname.replace(/[^a-zA-Z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uac00-\ud7af]/g, '');
    const ascii = clean.replace(/[^a-zA-Z0-9]/g, '');
    const base = ascii.length > 0 ? ascii : 'user';
    const styles: (() => string)[] = [
        () => base.toLowerCase(),                                      // yukireader
        () => base.toLowerCase().slice(0, 5) + Math.floor(Math.random() * 9999), // yuki3847
        () => base.slice(0, 3).toLowerCase() + crypto.randomBytes(2).toString('hex'), // yuk8f3a
        () => base.toLowerCase() + '_' + (Math.floor(Math.random() * 99) + 1),   // yukireader_42
        () => base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() + Math.floor(Math.random() * 999), // Yukireader483
        () => 'x' + crypto.randomBytes(3).toString('hex') + Math.floor(Math.random() * 99), // x8f3a2b47
    ];
    return styles[Math.floor(Math.random() * styles.length)]();
}

// ============================================================
// #5 랜덤 비밀번호 해시 (더미 bcrypt 형식)
// ============================================================
function randomPasswordHash(): string {
    return `$2b$10$${crypto.randomBytes(22).toString('base64').replace(/[+/=]/g, 'a').slice(0, 22)}`;
}

// ============================================================
// #3 likes 롱테일 분포 (power law)
// ============================================================
function randomLikes(): number {
    const r = Math.random();
    if (r < 0.80) return 0;        // 80%: 0
    if (r < 0.92) return 1;        // 12%: 1
    if (r < 0.96) return 2;        //  4%: 2
    if (r < 0.98) return Math.floor(Math.random() * 5) + 3;  // 2%: 3~7
    return Math.floor(Math.random() * 20) + 8;                // 2%: 8~27
}

// ============================================================
// #2 답글 시간 지연 (Pareto-like 헤비테일)
// 현실: 즉답 ~ 몇 달 후까지 다양한 범위
// ============================================================
function replyDelay(): number {
    const r = Math.random();
    let baseMs: number;

    if (r < 0.40) {
        // 40%: 즉답 (10초~5분)
        baseMs = 10000 + Math.random() * 290000;
    } else if (r < 0.65) {
        // 25%: 빠른 답글 (5~60분)
        baseMs = 5 * 60000 + Math.random() * 55 * 60000;
    } else if (r < 0.80) {
        // 15%: 수시간 후 (1~6시간)
        baseMs = 3600000 + Math.random() * 5 * 3600000;
    } else if (r < 0.90) {
        // 10%: 다음날 (6~48시간)
        baseMs = 6 * 3600000 + Math.random() * 42 * 3600000;
    } else if (r < 0.95) {
        // 5%: 며칠 후 (2~14일)
        baseMs = 2 * 86400000 + Math.random() * 12 * 86400000;
    } else {
        // 5%: 늦은 답글 (2주~3개월)
        baseMs = 14 * 86400000 + Math.random() * 76 * 86400000;
    }

    // 관일화 방지: 0.5x~1.5x 랜덤 배율
    const jitterMultiplier = 0.5 + Math.random();
    return Math.floor(baseMs * jitterMultiplier);
}

// ============================================================
// #6 Backfill 계정 생성일 (범위: 1일 ~ 2년 전)
// ============================================================
function generateAccountCreatedAt(publishedAt: Date): Date {
    const r = Math.random();
    let daysBeforePublish: number;
    if (r < 0.30) {
        // 30%: 신규 가입 (1~7일 전)
        daysBeforePublish = 1 + Math.random() * 6;
    } else if (r < 0.60) {
        // 30%: 기존 유저 (1~3개월 전)
        daysBeforePublish = 30 + Math.random() * 60;
    } else if (r < 0.85) {
        // 25%: 오래된 유저 (3~12개월 전)
        daysBeforePublish = 90 + Math.random() * 270;
    } else {
        // 15%: 초기 유저 (1~2년 전)
        daysBeforePublish = 365 + Math.random() * 365;
    }
    return new Date(publishedAt.getTime() - daysBeforePublish * 86400000);
}

// ============================================================
// #8 콘텐츠 중복 검사 정규화
// ============================================================
function normalizeForDedup(s: string): string {
    return s.replace(/[。、！？!?.,\s]/g, '').slice(0, 20).toLowerCase();
}

// ============================================================
// 시간대별 가중치 (현지 피크 시간 기반)
// 리서치: 19~21시 최대 피크, 점심/통근 부피크
// ============================================================
const HOUR_WEIGHTS: Record<string, number[]> = {
    // 24시간 가중치 [00~23], 합계 ≈ 1.0
    'ko': [.01, .01, .01, .01, .01, .02, .03, .06, .06, .03, .03, .04,
        .06, .06, .04, .04, .05, .05, .07, .10, .10, .07, .05, .03], // KST
    'ja': [.01, .01, .01, .01, .01, .02, .03, .06, .06, .03, .03, .04,
        .06, .06, .04, .04, .05, .05, .07, .10, .10, .07, .05, .03], // JST
    'en': [.03, .01, .01, .01, .01, .02, .03, .06, .06, .04, .04, .05,
        .06, .06, .04, .04, .05, .05, .06, .08, .08, .06, .05, .03], // EST
    'es': [.02, .01, .01, .01, .01, .01, .02, .04, .05, .04, .04, .05,
        .06, .06, .05, .05, .05, .06, .07, .08, .08, .07, .05, .03], // CET
};

function weightedRandomHour(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let h = 0; h < 24; h++) {
        r -= weights[h];
        if (r <= 0) return h;
    }
    return 23;
}

// ============================================================
// 5단 클러스터링 시간 분배
// 30% 즉시(1~15분), 25% 중기(1~3시간), 20% 당일(6~18시간),
// 15% 1주 내(1~7일), 10% 롱테일(1~4주)
// ============================================================
function distributeTimestamps(count: number, langCode: string): Date[] {
    const now = new Date();
    const timestamps: Date[] = [];

    for (let i = 0; i < count; i++) {
        const roll = Math.random();
        let offsetMs: number;

        if (roll < 0.30) {
            // 30% → 게시 직후 1~15분
            offsetMs = (1 + Math.random() * 14) * 60 * 1000;
        } else if (roll < 0.55) {
            // 25% → 1~3시간 후
            offsetMs = (60 + Math.random() * 120) * 60 * 1000;
        } else if (roll < 0.75) {
            // 20% → 6~18시간 후 (시간대 가중치 적용)
            const weights = HOUR_WEIGHTS[langCode] || HOUR_WEIGHTS['en'];
            const targetHour = weightedRandomHour(weights);
            const ts = new Date(now);
            ts.setHours(targetHour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
            if (ts.getTime() - now.getTime() < 6 * 3600 * 1000) {
                ts.setDate(ts.getDate() + 1);
            }
            offsetMs = ts.getTime() - now.getTime();
        } else if (roll < 0.90) {
            // 15% → 1~7일 후 (다음주 독자)
            const days = 1 + Math.random() * 6;
            const weights = HOUR_WEIGHTS[langCode] || HOUR_WEIGHTS['en'];
            const targetHour = weightedRandomHour(weights);
            const ts = new Date(now);
            ts.setDate(ts.getDate() + Math.floor(days));
            ts.setHours(targetHour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
            offsetMs = ts.getTime() - now.getTime();
        } else {
            // 10% → 1~4주 후 (롱테일 독자)
            const days = 7 + Math.random() * 21;
            const weights = HOUR_WEIGHTS[langCode] || HOUR_WEIGHTS['en'];
            const targetHour = weightedRandomHour(weights);
            const ts = new Date(now);
            ts.setDate(ts.getDate() + Math.floor(days));
            ts.setHours(targetHour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
            offsetMs = ts.getTime() - now.getTime();
        }

        // 관일화 방지: 초단위 랜덤 + 0.8x~1.2x 변동
        offsetMs = Math.floor(offsetMs * (0.8 + Math.random() * 0.4));
        offsetMs += Math.floor(Math.random() * 60) * 1000;

        timestamps.push(new Date(now.getTime() + Math.max(offsetMs, 60000)));
    }

    return timestamps.sort((a, b) => a.getTime() - b.getTime());
}

// ============================================================
// 조회수 + 화수 + 나이 기반 동적 댓글 수 (Poisson + Power-law v4)
// ============================================================

function poissonSampleEngine(λ: number): number {
    if (λ <= 0) return 0;
    if (λ < 30) {
        const L = Math.exp(-λ);
        let k = 0, p = 1;
        do { k++; p *= Math.random(); } while (p > L);
        return k - 1;
    }
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(λ + Math.sqrt(λ) * z));
}

function calculateTargetCount(
    views: number,
    epNumber: number,
    daysSincePublished: number,
): number {
    if (views <= 0) return 0;

    const k = 0.08 * (0.85 + Math.random() * 0.30);
    const b = 0.55 * (0.90 + Math.random() * 0.20);

    const D = 1 / (1 + 0.08 * Math.max(0, epNumber - 1));
    const A = epNumber <= 3
        ? Math.max(0.7, 1 / (1 + 0.01 * daysSincePublished))
        : 1 / (1 + 0.15 * daysSincePublished);

    let λ = k * Math.pow(views, 1 - b) * D * A;

    // Activation threshold
    if (views < 15) λ *= 0.3;
    else if (views < 30) λ *= 0.6;

    // 비율 상한
    λ = Math.min(λ, views * 0.02);

    return poissonSampleEngine(λ);
}

// ============================================================
// 소급 생성용 과거 타임스탬프 분배
// publishedAt ~ now 사이에 자연스럽게 분포
// 현실 패턴: 게시 직후 폭발 → 며칠간 산발 → 이후 드물게
// ============================================================
function distributeBackfillTimestamps(count: number, publishedAt: Date, langCode: string): Date[] {
    const now = new Date();
    const totalSpanMs = now.getTime() - publishedAt.getTime();
    if (totalSpanMs <= 0) return distributeTimestamps(count, langCode);

    const timestamps: Date[] = [];

    for (let i = 0; i < count; i++) {
        const roll = Math.random();
        let offsetMs: number;

        if (roll < 0.50) {
            // 50% → 게시 후 첫 24시간 내
            const first24h = Math.min(totalSpanMs, 24 * 3600 * 1000);
            offsetMs = Math.random() * first24h;
        } else if (roll < 0.75) {
            // 25% → 게시 후 1~7일 내
            const first7d = Math.min(totalSpanMs, 7 * 24 * 3600 * 1000);
            offsetMs = 24 * 3600 * 1000 + Math.random() * (first7d - 24 * 3600 * 1000);
            if (offsetMs < 0) offsetMs = Math.random() * totalSpanMs;
        } else {
            // 25% → 전체 기간 중 랜덤
            offsetMs = Math.random() * totalSpanMs;
        }

        // 시간대 가중치로 시간 보정
        const baseTime = new Date(publishedAt.getTime() + offsetMs);
        const weights = HOUR_WEIGHTS[langCode] || HOUR_WEIGHTS['en'];
        const targetHour = weightedRandomHour(weights);
        baseTime.setHours(targetHour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));

        // now를 넘지 않도록
        if (baseTime.getTime() > now.getTime()) {
            baseTime.setTime(publishedAt.getTime() + Math.random() * totalSpanMs);
        }

        timestamps.push(baseTime);
    }

    return timestamps.sort((a, b) => a.getTime() - b.getTime());
}

// ============================================================
// Azure GPT / OpenAI Review 호출 (한국어 route.ts 동일)
// ============================================================
async function callAzureGPT(
    prompt: string,
    temperature: number = 0.8,
    maxTokens: number = 400,  // 1200→400: 댓글 생성 특화 (큰 budget = 설명형 문장 유도)
): Promise<string> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-01-preview';
    const deployment = 'gpt-4omini';

    if (!endpoint || !apiKey) {
        console.warn('⚠️ Azure OpenAI not configured, skipping deep context');
        return '';
    }

    try {
        let url: string;
        if (endpoint.includes('/deployments/')) {
            url = endpoint;
        } else {
            const baseUrl = endpoint.replace(/\/openai\/v1\/?$/, '').replace(/\/$/, '');
            url = `${baseUrl}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                temperature,
                max_tokens: maxTokens,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`❌ Azure GPT error: ${response.status} — ${errorBody.substring(0, 200)}`);
            return '';
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    } catch (err) {
        console.error('❌ Azure GPT call failed:', err);
        return '';
    }
}

// ============================================================
// Few-shot 예시 샘플링 (lang.templates → buildCallXPrompt 주입용)
// ============================================================

/**
 * AI 클리셰 필터: 기존 수집 examples에서 평균회귀 유발 패턴 제거
 */
function isGoodExample(ex: string): boolean {
    return (
        ex.length < 80 &&
        !ex.startsWith('This ') &&    // "This chapter was amazing" 형
        !ex.startsWith('I love ') &&  // "I love how~" 형
        !ex.startsWith('I really ') &&
        !ex.includes("Can't wait") &&
        !ex.includes('This is so')
    );
}

/**
 * tone별 최소 1개 보장 + remaining 랜덤 샘플링
 * 순수 랜덤 정렬 방식은 특정 tone이 0개 나올 수 있음 → 의도한 스타일 앵커 실패
 */
function sampleExamples(
    templates: Record<string, string[]>,
    tones: string[],
    count: number
): string[] {
    const result: string[] = [];
    const used = new Set<string>();

    // 1단계: tone별 최소 1개 보장
    for (const t of tones) {
        const pool = (templates[t] || []).filter(ex => !used.has(ex) && isGoodExample(ex));
        if (pool.length > 0) {
            const picked = pool[Math.floor(Math.random() * pool.length)];
            result.push(picked);
            used.add(picked);
        }
    }

    // 2단계: remaining 랜덤 (전체 pool에서)
    const fullPool = tones
        .flatMap(t => templates[t] || [])
        .filter(ex => !used.has(ex) && isGoodExample(ex));
    const shuffled = fullPool.sort(() => Math.random() - 0.5);
    for (const ex of shuffled) {
        if (result.length >= count) break;
        result.push(ex);
        used.add(ex);
    }

    return result.sort(() => Math.random() - 0.5);
}

async function callOpenAIReview(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_REVIEW_API_KEY;
    const model = process.env.OPENAI_REVIEW_MODEL || 'o3-mini';

    if (!apiKey) {
        console.warn('⚠️ OpenAI Review API key not configured');
        return '';
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 800,
            }),
        });

        if (!response.ok) return '';
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    } catch (err) {
        console.error('❌ OpenAI Review call failed:', err);
        return '';
    }
}

// ============================================================
// getEpisodeContent — 타겟 언어 우선 + 한국어 fallback
// ============================================================
async function getEpisodeContent(
    episodeId: string,
    targetLang: string
): Promise<{ content: string; contentLanguage: string }> {
    // 1차: episode_translations에서 타겟 언어 번역본 시도
    if (targetLang !== 'ko') {
        try {
            const translationResult = await db.query(
                `SELECT translated_text, status FROM episode_translations 
                 WHERE episode_id = $1 AND language = $2 LIMIT 1`,
                [episodeId, targetLang]
            );
            const row = translationResult.rows[0];
            if (row && row.status === 'DONE' && row.translated_text && row.translated_text.length > 50) {
                console.log(`📖 [intl] Using ${targetLang} translation (${row.translated_text.length} chars)`);
                return { content: row.translated_text, contentLanguage: targetLang };
            }
        } catch (e) {
            console.warn(`⚠️ [intl] Translation table query failed, falling back to Korean`);
        }
    }

    // 2차: 원본 한국어
    const contentResult = await db.query(
        `SELECT content FROM episodes WHERE id = $1`, [episodeId]
    );
    const content = contentResult.rows[0]?.content || '';
    console.log(`📖 [intl] Using Korean original (${content.length} chars)`);
    return { content, contentLanguage: 'ko' };
}

// ============================================================
// 장르 유틸 (한국어 route.ts 동일)
// ============================================================
function getGenreWeights(genreData: string | string[] | null): Record<string, number> {
    if (!genreData) return {};
    const genres = Array.isArray(genreData)
        ? genreData
        : genreData.split(',').map(g => g.trim());

    const counts: Record<string, number> = {};
    for (const genre of genres) {
        const category = GENRE_CATEGORY_MAP[genre];
        if (category) counts[category] = (counts[category] || 0) + 1;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return {};

    const weights: Record<string, number> = {};
    for (const [cat, count] of Object.entries(counts)) {
        weights[cat] = count / total;
    }
    return weights;
}

// ============================================================
// 페르소나 선택 (한국어 route.ts 동일 구조, 언어팩 페르소나 사용)
// ============================================================
function selectPersonasForGenre(
    genreWeights: Record<string, number>,
    lang: LanguagePack,
    count: number = 8
): PersonaDef[] {
    const personaMap = new Map(lang.personas.map(p => [p.id, p]));
    const defaultPool = ['A1', 'A5', 'B1', 'C1', 'C3', 'C5', 'D1', 'D3', 'E2', 'E4', 'E5'];

    const categories = Object.keys(genreWeights);
    if (categories.length === 0) {
        const shuffled = [...defaultPool].sort(() => Math.random() - 0.5).slice(0, count);
        return shuffled.map(id => personaMap.get(id)).filter(Boolean) as PersonaDef[];
    }

    // Largest Remainder Method (한국어 route.ts 동일)
    const rawSlots = categories.map(cat => ({
        cat,
        raw: genreWeights[cat] * count,
        floor: Math.floor(genreWeights[cat] * count),
        remainder: (genreWeights[cat] * count) % 1
    }));

    let allocated = rawSlots.reduce((sum, s) => sum + s.floor, 0);
    const sorted = [...rawSlots].sort((a, b) => b.remainder - a.remainder);
    for (const slot of sorted) {
        if (allocated >= count) break;
        slot.floor += 1;
        allocated += 1;
    }

    const slotMap: Record<string, number> = {};
    for (const s of rawSlots) slotMap[s.cat] = s.floor;

    const selected: PersonaDef[] = [];
    const usedIds = new Set<string>();

    for (const [cat, slots] of Object.entries(slotMap)) {
        if (slots === 0) continue;
        const pool = GENRE_PERSONA_MAP[cat] || defaultPool;
        const available = pool.filter(id => !usedIds.has(id));
        const shuffled = [...available].sort(() => Math.random() - 0.5);

        for (let i = 0; i < Math.min(slots, shuffled.length); i++) {
            const p = personaMap.get(shuffled[i]);
            if (p) { selected.push(p); usedIds.add(shuffled[i]); }
        }
    }

    // 부족하면 기본 풀에서 보충
    if (selected.length < count) {
        const fallback = defaultPool.filter(id => !usedIds.has(id)).sort(() => Math.random() - 0.5);
        for (const id of fallback) {
            if (selected.length >= count) break;
            const p = personaMap.get(id);
            if (p) { selected.push(p); usedIds.add(id); }
        }
    }

    // chaos/casual 최소 1명씩 보장
    const hasChaos = selected.some(p => p.callGroup === 'chaos');
    const hasCasual = selected.some(p => p.callGroup === 'casual');
    if (!hasChaos && selected.length > 0) {
        const chaosPersona = lang.personas.filter(p => p.callGroup === 'chaos' && !usedIds.has(p.id))
            .sort(() => Math.random() - 0.5)[0];
        if (chaosPersona) selected[selected.length - 1] = chaosPersona;
    }
    if (!hasCasual && selected.length > 1) {
        const casualPersona = lang.personas.filter(p => p.callGroup === 'casual' && !usedIds.has(p.id))
            .sort(() => Math.random() - 0.5)[0];
        if (casualPersona) selected[selected.length - 2] = casualPersona;
    }

    return selected.slice(0, count);
}

// ============================================================
// Stage 1: Event Extraction (언어팩 프롬프트 사용)
// ============================================================
async function extractEvents(content: string, lang: LanguagePack): Promise<EventExtraction> {
    const trimmed = content.length > 3000 ? content.slice(-3000) : content;
    const prompt = lang.extractEventsPrompt(trimmed);
    const raw = await callAzureGPT(prompt);
    if (!raw) return { events: [], dominantEmotion: '' };

    try {
        const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        const data = JSON.parse(cleaned);
        if (data.events && Array.isArray(data.events)) {
            return { events: data.events, dominantEmotion: data.dominantEmotion || '' };
        }
    } catch (e) {
        console.warn('⚠️ [intl] Event extraction parse failed');
    }
    return { events: [], dominantEmotion: '' };
}

// ============================================================
// Stage 2: Reader Profiles (한국어 route.ts 동일 — 숫자 구조)
// ============================================================
function generateReaderProfiles(
    events: StoryEvent[], personas: PersonaDef[], dominantEmotion: string = ''
): ReaderProfile[] {
    const count = personas.length;
    const emotionSlots = [1.5, 3.5, 4.0, 5.5, 6.0, 7.5, 8.0, 9.5];
    while (emotionSlots.length < count) emotionSlots.push(Math.random() * 10);
    for (let i = emotionSlots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [emotionSlots[i], emotionSlots[j]] = [emotionSlots[j], emotionSlots[i]];
    }

    const allCharacters = [...new Set(events.flatMap(e => e.characters))];
    const bandwagonChar = Math.random() < 0.2 && allCharacters.length > 0
        ? allCharacters[Math.floor(Math.random() * allCharacters.length)]
        : null;

    const profiles: ReaderProfile[] = [];
    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    for (let i = 0; i < personas.length; i++) {
        const persona = personas[i];
        const emotion = i < emotionSlots.length ? emotionSlots[i] / 10 : Math.random();

        const profile: ReaderProfile = {
            type: persona.baseType,
            personaId: persona.id,
            personaTone: persona.tone,
            personaStyle: persona.style,
            personaEndings: persona.endings,
            personaCognitive: persona.cognitiveFocus,
            attentionSpan: 0,
            memoryNoise: 0,
            emotionalIntensity: emotion,
            literacy: 0,
            sarcasmLevel: 0,
        };

        switch (persona.baseType) {
            case 'immersed':
                profile.attentionSpan = rand(0.8, 1.0);
                profile.memoryNoise = rand(0, 0.1);
                profile.literacy = rand(0.6, 1.0);
                break;
            case 'skimmer':
                profile.attentionSpan = rand(0.2, 0.4);
                profile.memoryNoise = rand(0.3, 0.5);
                profile.literacy = rand(0.3, 0.6);
                break;
            case 'overreactor':
                profile.attentionSpan = rand(0.5, 0.8);
                profile.memoryNoise = rand(0.1, 0.2);
                profile.emotionalIntensity = Math.max(profile.emotionalIntensity, 0.8);
                profile.literacy = rand(0.3, 0.5);
                break;
            case 'analyst':
                profile.attentionSpan = rand(0.9, 1.0);
                profile.memoryNoise = 0;
                profile.literacy = rand(0.7, 1.0);
                break;
            case 'troll':
                profile.attentionSpan = rand(0.3, 0.6);
                profile.memoryNoise = rand(0.3, 0.7);
                profile.sarcasmLevel = rand(0.6, 1.0);
                profile.literacy = rand(0.2, 0.5);
                break;
            case 'misreader':
                profile.attentionSpan = rand(0.4, 0.6);
                profile.memoryNoise = rand(0.5, 0.8);
                profile.literacy = rand(0.4, 0.7);
                break;
            case 'lurker':
                profile.attentionSpan = rand(0.1, 0.3);
                profile.memoryNoise = 0;
                profile.literacy = rand(0.1, 0.3);
                break;
        }

        if (bandwagonChar && Math.random() < 0.4) {
            profile.bandwagonTarget = bandwagonChar;
        }

        // 감정 부스트 (구조 동일, 감정 키워드는 추후 언어팩으로 이동 가능)
        if (dominantEmotion) {
            const moodIntensityBoost: Record<string, number> = {
                '슬픔': 1.08, '소름': 1.06, '감동': 1.06,
                '긴장': 1.04, '분노': 1.05,
                '설렘': 1.0, '웃김': 1.0, '허탈': 1.0,
                // English
                'tension': 1.04, 'sadness': 1.08, 'anger': 1.05,
                'humor': 1.0, 'thrill': 1.06, 'romance': 1.0,
                'shock': 1.06, 'touching': 1.06,
            };
            const boost = moodIntensityBoost[dominantEmotion] || 1.0;
            profile.emotionalIntensity *= boost;
        }

        profiles.push(profile);
    }

    return profiles;
}

// ============================================================
// Stage 3: Info Restriction (한국어 route.ts 구조 동일)
// ============================================================
function buildReaderView(events: StoryEvent[], profile: ReaderProfile, lang: LanguagePack): string {
    const visibleCount = Math.max(1, Math.round(events.length * profile.attentionSpan));

    let visibleEvents: StoryEvent[];
    if (profile.type === 'skimmer') {
        visibleEvents = events.slice(0, visibleCount);
    } else if (profile.type === 'overreactor') {
        visibleEvents = [...events].sort((a, b) => b.importance - a.importance).slice(0, visibleCount);
    } else {
        const shuffled = [...events].sort(() => Math.random() - 0.5);
        visibleEvents = shuffled.slice(0, visibleCount);
    }

    // misreader 왜곡 (언어팩 distort 함수 사용)
    if (profile.type === 'misreader' && profile.memoryNoise > 0.3) {
        visibleEvents = visibleEvents.map(e => {
            if (Math.random() < profile.memoryNoise) {
                const useTextDistort = Math.random() < 0.4;
                return {
                    ...e,
                    summary: useTextDistort
                        ? lang.distortEventText(e.summary)
                        : lang.distortInterpretation(e.summary, e.characters),
                };
            }
            return e;
        });
    }

    switch (profile.type) {
        case 'lurker':
            return visibleEvents.map(e => e.characters.join('/') + ': ' + e.type).join(', ');
        case 'troll':
            return visibleEvents.map(e => `${e.characters[0] || '?'} — ${e.summary}`).join('\n');
        case 'analyst':
            return visibleEvents.map(e =>
                `[${e.type}] ${e.summary} (${e.characters.join(', ')})${e.quote ? ` — "${e.quote}"` : ''}${e.detail ? ` [${e.detail}]` : ''}`
            ).join('\n');
        default:
            return visibleEvents.map(e =>
                `${e.summary}${e.quote ? ` — "${e.quote}"` : ''}${e.detail ? ` (${e.detail})` : ''}`
            ).join('\n');
    }
}

// ============================================================
// Stage 5: 집단 동조 파동 (언어팩 문자열 사용)
// ============================================================
function injectHerdEffect(comments: string[], lang: LanguagePack): string[] {
    if (Math.random() > 0.15 || comments.length < 4) return comments; // 50% reduced for testing (was 0.3)

    const candidates = comments.filter(c => c.length >= 5);
    if (candidates.length === 0) return comments;

    const seedIdx = Math.floor(Math.random() * candidates.length);
    const seed = candidates[seedIdx];
    const keyword = lang.extractKeyword(seed);
    if (!keyword) return comments;

    console.log(`👥 [intl] Herd: seed="${seed}", keyword="${keyword}"`);

    const echoTemplates = lang.herdEchoTemplates(keyword);
    const counterTemplates = lang.herdCounterTemplates(keyword);

    const echoCount = 2 + Math.floor(Math.random() * 2);
    const echoes = echoTemplates.sort(() => Math.random() - 0.5).slice(0, echoCount);
    const counter = counterTemplates[Math.floor(Math.random() * counterTemplates.length)];

    const result = [...comments];
    const seedPosition = result.indexOf(seed);
    const insertAt = seedPosition >= 0 ? seedPosition + 1 : result.length;

    const cluster: string[] = [];
    cluster.push(echoes[0]);
    if (echoes.length >= 2) cluster.push(echoes[1]);
    cluster.push(counter);
    if (echoes.length >= 3) cluster.push(echoes[2]);

    result.splice(insertAt, 0, ...cluster);
    return result;
}

// ============================================================
// Stage 6: 감정 증폭 (언어팩 패턴 사용)
// ============================================================
function amplifyEmotions(comments: string[], lang: LanguagePack): string[] {
    const result = [...comments];

    const highEmotionIdx: number[] = [];
    result.forEach((c, i) => {
        if (lang.highEmotionPattern.test(c)) highEmotionIdx.push(i);
    });

    if (highEmotionIdx.length === 0) return result;

    let inserted = 0;
    for (const idx of highEmotionIdx) {
        if (Math.random() < 0.5 && inserted < 2) {
            const booster = lang.emotionBoosters[Math.floor(Math.random() * lang.emotionBoosters.length)];
            result.splice(idx + 1 + inserted, 0, booster);
            inserted++;
        }
    }

    return result;
}

// ============================================================
// Stage 7: Curator (언어팩 curateScoring + GPT-5)
// ============================================================
async function curateWithGPT5(comments: string[], lang: LanguagePack, targetCount: number = 8): Promise<string[]> {
    // 코드 사전필터: 언어팩 기반 AI 티 감점
    const scored = comments.map(comment => {
        const cleaned = comment.replace(/\.$/g, '').trim();
        const { score } = lang.curateScoring(cleaned);
        return { text: cleaned, score };
    });

    // === Spectrum Preservation (스펙트럼 보존) ===
    // 하위 20% 제거 대신: Tier 1 즉사(0점)만 제거, 나머지는 보존
    scored.sort((a, b) => b.score - a.score);

    // Tier 1 즉사만 제거 (score === 0)
    const alive = scored.filter(s => s.score > 0);
    const killed = scored.filter(s => s.score === 0);
    for (const d of killed) {
        console.log(`🔪 [intl] AI-DNA kill (${d.score}): "${d.text}"`);
    }

    // 상위 10% "너무 완벽한" 댓글 제거 (균질화 방지)
    const topCut = Math.ceil(alive.length * 0.1);
    const tooClean = alive.slice(0, topCut).filter(s => s.score >= 90 && s.text.length > 50);
    for (const d of tooClean) {
        console.log(`✨ [intl] Too-clean removal (${d.score}): "${d.text}"`);
    }
    const preFiltered = alive.filter(s => !tooClean.includes(s));

    // === Length Distribution Enforcement (길이 분포 강제) ===
    const shortComments = preFiltered.filter(s => s.text.split(' ').length <= 5);
    const longComments = preFiltered.filter(s => s.text.includes('. ') || s.text.includes('! ') || s.text.length > 80);
    const medComments = preFiltered.filter(s => !shortComments.includes(s) && !longComments.includes(s));

    // 최소 비율 보장: short 8%, long 15%
    const minShort = Math.max(1, Math.ceil(targetCount * 0.08));
    const minLong = Math.max(1, Math.ceil(targetCount * 0.15));
    const maxMed = Math.ceil(targetCount * 0.40);

    console.log(`📏 [intl] Length dist: short=${shortComments.length}(min${minShort}), med=${medComments.length}(max${maxMed}), long=${longComments.length}(min${minLong})`);

    // === 30% Curator Bypass (자연 무질서 보존) ===
    const bypassCount = Math.ceil(preFiltered.length * 0.3);
    const shuffledPre = [...preFiltered].sort(() => Math.random() - 0.5);
    const bypassed = shuffledPre.slice(0, bypassCount);
    const toCurate = shuffledPre.slice(bypassCount);

    // GPT-5 큐레이터 (직관 기반 — 언어별 커뮤니티 페르소나)
    const commentList = toCurate.map((s, i) => `${i}: "${s.text}"`).join('\n');
    const targetCurateCount = Math.max(1, targetCount - Math.ceil(bypassCount * 0.3));

    // 언어별 curator 프롬프트 사용 (없으면 기본 영어 프롬프트)
    const curatorPrompt = lang.curatorPrompt
        ? lang.curatorPrompt(commentList, targetCurateCount)
        : `You've been on ${lang.platformString || 'Royal Road'} for years. You scroll fast. You don't overthink.

Someone made a bot to fake comments. Your job is not to pick the best ones.
Your job is to pick the ones that wouldn't make you suspicious.

Don't analyze sentence structure.
Don't optimize balance.
Don't try to be fair.

Just ask yourself:

If you saw this comment in a real chapter, would you pause and think "huh, that sounds generated"?

If yes → remove it.
If no → keep it.

Real comment sections are messy.
Some people didn't read carefully.
Some people are bored.
Some just type and leave.

Pick the ones that feel like that.

Here are ${toCurate.length} comments. Pick ${targetCurateCount}.

${commentList}

Output only JSON:
{ "selected": [indices] }`;

    const curatorRaw = await callOpenAIReview(curatorPrompt);
    let finalComments: string[] = [];

    if (curatorRaw) {
        try {
            const cleaned = curatorRaw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            const curatorData = JSON.parse(cleaned);
            if (curatorData.selected && Array.isArray(curatorData.selected)) {
                finalComments = curatorData.selected
                    .filter((idx: number) => idx >= 0 && idx < toCurate.length)
                    .map((idx: number) => toCurate[idx].text);
            }
        } catch (e) {
            console.warn('⚠️ [intl] GPT-5 curator parse failed');
        }
    }

    // 바이패스된 댓글 중 일부 삽입 (무질서 보존)
    const bypassInsert = bypassed.sort(() => Math.random() - 0.5).slice(0, Math.ceil(bypassCount * 0.3)).map(s => s.text);
    finalComments.push(...bypassInsert);

    if (finalComments.length < targetCount) {
        const needed = targetCount - finalComments.length;
        const remaining = preFiltered.filter(s => !finalComments.includes(s.text)).map(s => s.text);
        finalComments.push(...remaining.slice(0, needed));
    }
    finalComments = finalComments.slice(0, targetCount);
    console.log(`🎯 [intl] Curator: ${toCurate.length} curated + ${bypassInsert.length} bypassed = ${finalComments.length} final`);

    // 후처리 노이즈 (언어팩)
    const noised = finalComments.map(text => lang.applyPostNoise(text));

    // 셔플 (70% 랜덤)
    for (let i = noised.length - 1; i > 0; i--) {
        if (Math.random() < 0.7) {
            const j = Math.floor(Math.random() * (i + 1));
            [noised[i], noised[j]] = [noised[j], noised[i]];
        }
    }

    return noised;
}

// ============================================================
// 7-Stage Pipeline 메인 함수
// ============================================================
async function generateDeepContextComments(
    episodeContent: string,
    genreWeights: Record<string, number>,
    lang: LanguagePack,
    count: number = 8,
    sourceLanguage: string = 'ko'
): Promise<{ comments: string[]; midComments: string[]; detectedTags: string[] }> {
    // Stage 1: Event Extraction
    console.log('📋 [intl] Stage 1: Extracting events...');
    const extraction = await extractEvents(episodeContent, lang);
    const { events, dominantEmotion } = extraction;

    if (events.length === 0) {
        console.warn('⚠️ [intl] No events extracted');
        return { comments: [], midComments: [], detectedTags: [] };
    }

    // Stage 1.5: Persona Selection
    const personas = selectPersonasForGenre(genreWeights, lang, count);

    // Stage 2: Reader Profiles
    console.log('👥 [intl] Stage 2: Reader profiles...');
    const profiles = generateReaderProfiles(events, personas, dominantEmotion);

    // Stage 3: Info Restriction
    console.log('🔒 [intl] Stage 3: Reader views...');
    const readerViews = profiles.map(p => ({
        profile: p,
        view: buildReaderView(events, p, lang),
    }));

    // Stage 4: callGroup별 분리 GPT 호출
    const primaryGenre = Object.entries(genreWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const moodHint = dominantEmotion ? `\nMood: "${dominantEmotion}"` : '';
    const genreHint = ''; // 언어팩 프롬프트 빌더가 처리

    const sceneContext = events.slice(0, 3)
        .filter(e => e.quote && e.quote.length > 0)
        .map(e => `"${e.quote}" (${e.summary})`)
        .join(', ');

    const episodeExcerpt = episodeContent.length > 500
        ? episodeContent.slice(-500)
        : episodeContent;

    const immersedViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'immersed';
    });
    const overreactorViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'overreactor';
    });
    const chaosViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'chaos';
    });
    const casualViews = readerViews.filter(r => {
        const persona = personas.find(p => p.id === r.profile.personaId);
        return persona?.callGroup === 'casual';
    });

    const promptArgs: CallPromptArgs = {
        platform: lang.platformString,
        moodHint,
        genreHint,
        episodeExcerpt,
        sceneContext,
        readerViews: [],  // filled per call
        primaryGenre,
        targetCommentCount: 0,  // filled per call
    };

    // ── Few-shot 예시 샘플링 (lang.templates → 각 call 프롬프트 맨 마지막 주입) ──
    // 일본어는 call4/5에서 theorist tone을 강제 포함 (복선추측/설정고찰 활성화)
    const isJa = lang.code === 'ja';
    const call1Examples = sampleExamples(lang.templates, ['short_reactor', 'emotional'], 3);
    const call2Examples = sampleExamples(lang.templates, ['emotional', 'cheerleader'], 4);
    const call3Examples = [
        ...sampleExamples(lang.templates, ['critic'], 3),
        // chaos call 하드코딩 믹스: 언어별 chaos 앵커 강화
        ...(isJa
            ? ['は？', 'これ誰だっけ', 'え、終わり？']
            : ['lmao what', '??????', 'author drunk']),
    ];
    const call4Examples = sampleExamples(
        lang.templates,
        isJa ? ['theorist', 'short_reactor'] : ['theorist', 'critic'],
        4
    );
    const call5Examples = sampleExamples(lang.templates, ['short_reactor', 'theorist'], 3);

    // Build prompts via LanguagePack (examples 주입)
    const call1 = lang.buildCall1Prompt({ ...promptArgs, readerViews: immersedViews, targetCommentCount: Math.min(immersedViews.length * 2, 8), examples: call1Examples });
    const call2 = lang.buildCall2Prompt({ ...promptArgs, readerViews: overreactorViews, targetCommentCount: Math.min(overreactorViews.length * 2, 6), examples: call2Examples });
    const call3 = lang.buildCall3Prompt({ ...promptArgs, readerViews: chaosViews, targetCommentCount: Math.min(chaosViews.length * 2, 4), examples: call3Examples });
    const call4 = lang.buildCall4Prompt({ ...promptArgs, readerViews: casualViews, targetCommentCount: Math.min(casualViews.length * 2, 4), examples: call4Examples });
    const call5 = lang.buildCall5Prompt({ ...promptArgs, readerViews: [], targetCommentCount: 15, examples: call5Examples });

    // 5회 병렬 호출 (call별 temperature 차등)
    // call3(chaos) = 1.0 (1.1은 Azure에서 JSON 깨짐 위험), 나머지는 0.7~0.8
    console.log('🧠 [intl] Stage 4: Persona-based GPT calls (few-shot enabled)...');
    const [raw1, raw2, raw3, raw4, raw5] = await Promise.all([
        call1 ? callAzureGPT(call1, 0.7) : Promise.resolve(''),
        call2 ? callAzureGPT(call2, 0.8) : Promise.resolve(''),
        call3 ? callAzureGPT(call3, 1.0) : Promise.resolve(''),  // chaos: high entropy
        call4 ? callAzureGPT(call4, 0.8) : Promise.resolve(''),
        callAzureGPT(call5, 0.7),
    ]);
    const rawResults = [raw1, raw2, raw3, raw4, raw5];

    // 결과 합치기
    const safeComments: string[] = [];
    const chaosComments: string[] = [];
    let detectedTags: string[] = [];

    const parseComments = (raw: string | null): string[] => {
        if (!raw) return [];
        // Aggressive code fence cleanup
        let cleaned = raw
            .replace(/^```json\s*\n?/i, '')
            .replace(/\n?```\s*$/i, '')
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .replace(/^json\s*/i, '')
            .trim();
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed.tags) {
                detectedTags = (parsed.tags || []).filter((t: string) =>
                    ['battle', 'romance', 'betrayal', 'cliffhanger', 'comedy', 'powerup', 'death', 'reunion'].includes(t)
                );
            }
            return (parsed.comments || [])
                .map((c: string) => lang.stripLabel(c))
                .filter((c: string) => c.length >= lang.minCommentLength && c.length < lang.maxCommentLength)
                .filter((c: string) => !c.includes('```') && !c.includes('"comments"') && !c.includes('{'));
        } catch {
            return raw.split('\n')
                .map((l: string) => lang.stripLabel(l.replace(/^\d+[\.)\\-]\s*/, '')))
                .filter((l: string) => l.length >= lang.minCommentLength && l.length < lang.maxCommentLength)
                .filter((l: string) => !l.includes('```') && !l.includes('"comments"') && !l.includes('{'));
        }
    };

    // rawResults[0~4] = [call1, call2, call3, call4, call5] 고정 (call 없으면 빈 문자열)
    safeComments.push(...parseComments(rawResults[0] || null));   // call1: immersed
    safeComments.push(...parseComments(rawResults[1] || null));   // call2: overreactor
    chaosComments.push(...parseComments(rawResults[2] || null));  // call3: chaos
    safeComments.push(...parseComments(rawResults[3] || null));   // call4: casual

    // 중간밀도
    const midComments: string[] = parseComments(rawResults[4] || null)
        .filter(c => c.length >= lang.midDensityRange[0] && c.length <= lang.midDensityRange[1]);

    console.log(`📊 [intl] Raw: safe=${safeComments.length}, chaos=${chaosComments.length}, mid=${midComments.length}`);

    // Keyword-based semantic dedup: prevent same event keyword from dominating
    const eventKeywords = events
        .map(e => e.summary.toLowerCase().split(/\s+/).filter(w => w.length > 4))
        .flat();
    const keywordCounts = new Map<string, number>();
    const dedupedSafe = safeComments.filter(comment => {
        const lower = comment.toLowerCase();
        let dominated = false;
        for (const kw of eventKeywords) {
            if (lower.includes(kw)) {
                const count = keywordCounts.get(kw) || 0;
                if (count >= 3) { dominated = true; break; }
                keywordCounts.set(kw, count + 1);
            }
        }
        return !dominated;
    });
    if (dedupedSafe.length < safeComments.length) {
        console.log(`🔁 [intl] Semantic dedup: ${safeComments.length} → ${dedupedSafe.length}`);
    }

    // --- Post-processing filters (probabilistic, not deterministic) ---

    // Fix B: Slang frequency limiter — decay probability, not hard cutoff
    const slangPatterns: [RegExp, string][] = [
        [/\bfr fr\b/i, 'fr fr'], [/\blowkey\b/i, 'lowkey'], [/\bngl\b/i, 'ngl'],
        [/\btbh\b/i, 'tbh'], [/\bno cap\b/i, 'no cap'], [/\bbruh\b/i, 'bruh'],
    ];
    const smashPattern = /[a-z]{8,}/;
    let smashCount = 0;
    const slangCounts = new Map<string, number>();
    const afterSlang = dedupedSafe.filter(comment => {
        const lower = comment.toLowerCase();
        // Keyboard smash: max 1 per batch
        if (smashPattern.test(lower) && /(?:asdf|jkl|qwer|zxcv|asdj|fjsk)/i.test(lower)) {
            smashCount++;
            if (smashCount > 1) return false;
        }
        for (const [pattern, key] of slangPatterns) {
            if (pattern.test(lower)) {
                const count = slangCounts.get(key) || 0;
                slangCounts.set(key, count + 1);
                // Steeper decay: 1st-2nd keep, 3rd 30%, 4th 5%, 5th+ 0%
                if (count >= 2) {
                    const keepChance = count === 2 ? 0.3 : count === 3 ? 0.05 : 0;
                    if (Math.random() > keepChance) return false;
                }
            }
        }
        return true;
    });

    // Fix D: CAPS limiter — softening not killing
    const capsMax = 2 + Math.floor(Math.random() * 4);
    let capsCount = 0;
    const lolSuffixes = [' lol', ' lmao', ' haha', ' bruh', ''];
    const afterCaps = afterSlang.map(comment => {
        const upperRatio = comment.length > 5
            ? (comment.match(/[A-Z]/g) || []).length / comment.length
            : 0;
        if (upperRatio > 0.5) {
            capsCount++;
            if (capsCount > capsMax) {
                // 에너지 흐리게 (전부 소문자 + lol 붙이기)
                const suffix = lolSuffixes[Math.floor(Math.random() * lolSuffixes.length)];
                return comment.toLowerCase() + suffix;
            }
        }
        return comment;
    });

    // Fix E: Word-overlap dedup — 70% threshold, allow 2 natural dupes
    let dupeAllowance = 2; // humans repeat similar things
    const afterDedup: string[] = [];
    for (const comment of afterCaps) {
        const words = new Set(comment.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        if (words.size < 2) { afterDedup.push(comment); continue; }
        const isDupe = afterDedup.some(existing => {
            const existWords = new Set(existing.toLowerCase().split(/\s+/).filter(w => w.length > 2));
            if (existWords.size < 2) return false;
            const overlap = [...words].filter(w => existWords.has(w)).length;
            return overlap / Math.min(words.size, existWords.size) > 0.7;
        });
        if (isDupe && dupeAllowance > 0) {
            dupeAllowance--;
            afterDedup.push(comment); // keep 1 natural duplicate
        } else if (!isDupe) {
            afterDedup.push(comment);
        }
    }

    console.log(`🧹 [intl] Filters: ${dedupedSafe.length} → slang:${afterSlang.length} → caps_adj → dedup:${afterDedup.length}`);

    // === 🔥 Messiness Layer (덜 정돈되게 만드는 레이어) ===
    const messied = afterDedup.map(comment => {
        // (0) "The X is/was Y" → 구어체 변환 (살아남은 리뷰톤 잡기)
        const theMatch = comment.match(/^The (\w+(?:\s+\w+)?)\s+(is|was|felt|are|were)\s+(.+)/i);
        if (theMatch) {
            const options = [
                `that ${theMatch[1].toLowerCase()} tho`,
                `${theMatch[1].toLowerCase()} ${theMatch[2]} ${theMatch[3].replace(/\.$/, '')}`,
                `${theMatch[1].toLowerCase()} tho`,
            ];
            return options[Math.floor(Math.random() * options.length)];
        }
        // (1) 이유-결과 40% 절단: "shows a deeper side to him" → "shows a deeper side"
        if (Math.random() < 0.4) {
            const truncMatch = comment.match(/^(.+?\b(?:makes?|shows?|adds?|gives?)\s+\w+(?:\s+\w+)?)\s+(?:to|of|for|about|in)\b/i);
            if (truncMatch) return truncMatch[1];
        }
        // (2) 마지막 단어 5% 절단 (미완성 문장)
        if (Math.random() < 0.05 && comment.split(' ').length > 4) {
            const words = comment.split(' ');
            words.pop();
            return words.join(' ');
        }
        // (3) 마침표 8% 제거 (끊김 효과)
        if (Math.random() < 0.08 && /\.$/.test(comment)) {
            return comment.slice(0, -1);
        }
        return comment;
    });

    // === 🔁 Structure Pattern Dedup (같은 시작 패턴 통계 컷) ===
    const patternMap = new Map<string, string[]>();
    for (const comment of messied) {
        const words = comment.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
        const key = words || '__empty__';
        if (!patternMap.has(key)) patternMap.set(key, []);
        patternMap.get(key)!.push(comment);
    }
    const afterPatternDedup: string[] = [];
    for (const [pattern, group] of patternMap) {
        if (group.length > 2) {
            // 같은 시작 패턴 3개 이상 → 2개만 유지 (랜덤)
            const shuffled = group.sort(() => Math.random() - 0.5);
            afterPatternDedup.push(...shuffled.slice(0, 2));
            console.log(`🔁 [intl] Pattern dedup: "${pattern}" ${group.length} → 2`);
        } else {
            afterPatternDedup.push(...group);
        }
    }

    // === 📊 Hard Quota Enforcement (비율 하드캡) ===
    const maxTwoSentence = Math.ceil(afterPatternDedup.length * 0.20); // 2문장 이상 최대 20%
    const maxLong = Math.ceil(afterPatternDedup.length * 0.25); // 15단어+ 최대 25%
    const maxExplanation = Math.ceil(afterPatternDedup.length * 0.10); // 설명형 동사 최대 10%

    let twoSentCount = 0;
    let longCount = 0;
    let explanationCount = 0;
    const afterQuota = afterPatternDedup.filter(comment => {
        const isTwoSent = /\. [A-Z]/.test(comment);
        const isLong = comment.split(' ').length >= 15;
        const hasExplanation = /\b(shows?|adds?|highlights?|demonstrates?|brings?|creates?|captures?)\b/i.test(comment);

        if (isTwoSent) {
            twoSentCount++;
            if (twoSentCount > maxTwoSentence) return false;
        }
        if (isLong) {
            longCount++;
            if (longCount > maxLong) return false;
        }
        if (hasExplanation) {
            explanationCount++;
            if (explanationCount > maxExplanation) return false;
        }
        return true;
    });
    console.log(`📊 [intl] Quotas: 2sent=${twoSentCount}(max${maxTwoSentence}), long=${longCount}(max${maxLong}), explain=${explanationCount}(max${maxExplanation})`);

    // === 🧠 Cognitive Break Injection (인지 오류 주입) ===
    const cognitiveBreaks = [
        'wait who said that',
        'wasn\'t that the other guy',
        'hold on i missed something',
        'wait is this the same chapter',
        'did i skip a page or',
        'why does everyone keep saying that',
        'ok but what happened to the other one',
        'am i the only one confused',
        'i thought he already did that',
        'wait that doesn\'t make sense',
        'huh? when did that happen',
        'did anyone else misread that lol',
        'i keep getting the names mixed up',
        'wait go back',
    ];
    const breakCount = Math.max(1, Math.ceil(afterQuota.length * 0.15));
    const withBreaks = [...afterQuota];
    for (let i = 0; i < breakCount && cognitiveBreaks.length > 0; i++) {
        const breakIdx = Math.floor(Math.random() * cognitiveBreaks.length);
        const insertIdx = Math.floor(Math.random() * withBreaks.length);
        withBreaks.splice(insertIdx, 0, cognitiveBreaks.splice(breakIdx, 1)[0]);
    }
    console.log(`🧠 [intl] Cognitive breaks: +${breakCount} injected (total ${withBreaks.length})`);
    console.log(`🎲 [intl] Diversity pipeline: ${afterDedup.length} → mess:${messied.length} → pattern:${afterPatternDedup.length} → quota:${afterQuota.length} → breaks:${withBreaks.length}`);

    // Stage 5: Emotion Amplification (감정 먼저 → 자연스러운 깨짐)
    const withEmotion = amplifyEmotions(withBreaks, lang);

    // Stage 6: Herd Effect (50% 감소 — 테스트 중 연출감 방지)
    const withHerd = injectHerdEffect(withEmotion, lang);

    // Stage 7: Curator
    const chaosRoll = Math.random();
    const chaosInsertCount = Math.min(chaosComments.length, chaosRoll < 0.1 ? 0 : chaosRoll < 0.6 ? 1 : 2);
    const curatorTarget = Math.max(1, count - chaosInsertCount);
    const filtered = await curateWithGPT5(withEmotion, lang, curatorTarget);

    // chaos 삽입
    const selectedChaos = chaosComments.sort(() => Math.random() - 0.5).slice(0, chaosInsertCount);
    const finalMerged = [...filtered];
    for (const chaos of selectedChaos) {
        const pos = Math.floor(Math.random() * (finalMerged.length + 1));
        finalMerged.splice(pos, 0, chaos);
    }

    return { comments: finalMerged, midComments, detectedTags };
}

// ============================================================
// pickComment — 템플릿 기반 댓글 선택 (한국어 route.ts 동일 구조)
// ============================================================
function pickComment(
    tone: PersonalityTone,
    lang: LanguagePack,
    usedTemplates: Set<string>,
    characterNames: string[],
    genreKey: string = ''
): string {
    // 25% 장르 템플릿
    if (genreKey && Math.random() < 0.25) {
        const genrePool = lang.genreTemplates[genreKey];
        if (genrePool && genrePool.length > 0) {
            const available = genrePool.filter(t => !usedTemplates.has(t));
            let selected = available.length === 0
                ? genrePool[Math.floor(Math.random() * genrePool.length)]
                : available[Math.floor(Math.random() * available.length)];
            usedTemplates.add(selected);
            selected = lang.applyDynamicVariations(selected);
            selected = lang.humanize(selected);
            return selected;
        }
    }

    // Universal 템플릿

    const pool = lang.templates[tone];
    const available = pool.filter(t => !usedTemplates.has(t));
    let selected: string;
    if (available.length === 0) {
        usedTemplates.clear();
        selected = pool[Math.floor(Math.random() * pool.length)];
    } else {
        selected = available[Math.floor(Math.random() * available.length)];
    }
    usedTemplates.add(selected);
    selected = lang.applyDynamicVariations(selected);
    selected = lang.humanize(selected);
    return selected;
}

// ============================================================
// 메인 실행 함수 — 한국어 GET handler의 내부 로직 추출
// ============================================================
export async function runCommentBotIntl(
    novelId: string,
    lang: LanguagePack,
    baseCount: number = 60,
    density: number = 1.0,
    useDeep: boolean = true,
    targetEpisodeId?: string,
    backfill: boolean = false,
    publishedAt?: Date,
    recurringReaders: RecurringReader[] = [],
    externalTimestamps?: Date[],  // 외부 주입 타임슬롯 (인터리빙용)
): Promise<CommentBotResult> {
    const totalCount = Math.round(baseCount * density);
    let personalityWeights = lang.defaultWeights;

    console.log(`🤖[intl] Starting comment bot for ${novelId} (lang=${lang.code}, count=${totalCount})...`);

    // 1. 에피소드 ID 결정
    let episodeId: string;
    if (targetEpisodeId) {
        episodeId = targetEpisodeId;
    } else {
        const episodeResult = await db.query(
            `SELECT id FROM episodes WHERE novel_id = $1 ORDER BY ep ASC LIMIT 1`,
            [novelId]
        );
        if (episodeResult.rows.length === 0) {
            throw new Error(`No episodes found for ${novelId}`);
        }
        episodeId = episodeResult.rows[0].id;
    }
    const episodeIds = [episodeId];

    // 1.5. 캐릭터 이름 로딩
    const entityResult = await db.query(
        `SELECT source_text FROM entities WHERE novel_id = $1 AND (category = 'character' OR category IS NULL) LIMIT 20`,
        [novelId]
    );
    const characterNames: string[] = entityResult.rows.map((r: { source_text: string }) => r.source_text);

    // 2. 기존 댓글 캐싱 (답글 가중치용)
    const existingResult = await db.query(
        `SELECT c.id, COALESCE(COUNT(r.id), 0) AS reply_count, c.content, c.created_at
         FROM comments c
         LEFT JOIN comments r ON r.parent_id = c.id
         WHERE c.episode_id = $1
         GROUP BY c.id`,
        [episodeId]
    );
    const commentPool: { id: string; content: string; reply_count: number; created_at: Date | null }[] = existingResult.rows.map(
        (r: { id: string; content: string; reply_count: string; created_at: string | null }) => ({
            id: r.id, content: r.content, reply_count: parseInt(r.reply_count) || 0,
            created_at: r.created_at ? new Date(r.created_at) : null,
        })
    );

    // 3. 소설 장르 조회
    const novelResult = await db.query(
        `SELECT genre, source_language FROM novels WHERE id = $1`, [novelId]
    );
    const genreData = novelResult.rows[0]?.genre;
    const genreWeights = getGenreWeights(genreData);

    // 장르 기반 personalityWeights 덮어쓰기
    const primaryGenre = Object.entries(genreWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    if (primaryGenre && lang.genreWeights[primaryGenre]) {
        personalityWeights = lang.genreWeights[primaryGenre];
    }

    // 4. Deep Context GPT 댓글 생성
    let deepComments: string[] = [];
    let midDensityPool: string[] = [];
    let sceneTags: string[] = [];
    let contentLanguage = lang.code;

    if (useDeep) {
        const { content: episodeContent, contentLanguage: cl } = await getEpisodeContent(episodeId, lang.code);
        contentLanguage = cl;

        if (episodeContent && episodeContent.length > 50) {
            let calls = 0;
            while (deepComments.length < totalCount && calls < 6) {
                const result = await generateDeepContextComments(
                    episodeContent, genreWeights, lang, 15, contentLanguage
                );
                deepComments.push(...result.comments);
                midDensityPool.push(...result.midComments);
                if (calls === 0) sceneTags = result.detectedTags;
                calls++;
                console.log(`   → [intl] Batch ${calls}: +${result.comments.length} (total ${deepComments.length}/${totalCount})`);
            }
        }
    }

    // 5. 봇 생성 & 댓글 작성
    const usedTemplates = new Set<string>();
    const existingNicknameResult = await db.query(
        `SELECT DISTINCT u.name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.episode_id = $1`,
        [episodeId]
    );
    const usedNicknames = new Set<string>(
        existingNicknameResult.rows.map((r: { name: string }) => r.name)
    );

    let totalCommentsPosted = 0;
    // 1봇 = 1댓글: 봇 수 = 댓글 수
    const botCount = totalCount;

    // 🔥 타임스탬프 생성: 외부 주입 우선 → backfill → 미래 스케줄링
    const scheduledTimes = externalTimestamps && externalTimestamps.length >= totalCount
        ? externalTimestamps.slice(0, totalCount).sort((a, b) => a.getTime() - b.getTime())
        : backfill && publishedAt
            ? distributeBackfillTimestamps(totalCount, publishedAt, lang.code)
            : distributeTimestamps(totalCount, lang.code);

    for (let i = 0; i < botCount && totalCommentsPosted < totalCount; i++) {
        let userId: string;
        let nickname: string;

        // #4 상주 독자: 처음 N개 슬롯은 recurring pool에서 (이미 생성된 계정 재사용)
        if (i < recurringReaders.length) {
            const reader = recurringReaders[i];
            // 같은 에피소드에 이미 댓글 단 상주 독자는 스킵
            if (usedNicknames.has(reader.nickname)) {
                continue;
            }
            userId = reader.userId;
            nickname = reader.nickname;
            usedNicknames.add(nickname);
            console.log(`🔁 [intl] Recurring ${reader.tier} ${i + 1}/${recurringReaders.length}: "${nickname}"`);
        } else {
            // 새 일회성 봇 생성
            nickname = pickNickname(lang.nicknamePool, usedNicknames);
            console.log(`🎭 [intl] Bot ${i + 1}/${botCount}: nickname="${nickname}"`);

            const username = generateRealisticUsername(nickname);
            const pwHash = randomPasswordHash();
            const userCreatedAt = backfill && publishedAt
                ? generateAccountCreatedAt(publishedAt)
                : new Date();
            const userResult = await db.query(
                `INSERT INTO users(username, password_hash, name, is_hidden, role, created_at)
                 VALUES($1, $2, $3, FALSE, 'bot', $4) RETURNING id`,
                [username, pwHash, nickname, userCreatedAt]
            );
            userId = userResult.rows[0].id;
        }
        const tone = pickPersonalityTone(personalityWeights);

        // 1봇 1댓글: 30% 확률로 템플릿 직접 사용, 나머지는 GPT 풀
        let content: string;
        const useTemplate = Math.random() < 0.30;

        if (useTemplate) {
            // tone에 맞는 템플릿 먼저, 없으면 전체에서 랜덤
            const toneTemplates = lang.templates[tone] ?? [];
            const allTemplates = Object.values(lang.templates).flat();
            const pool = toneTemplates.length > 0 ? toneTemplates : allTemplates;

            if (pool.length > 0) {
                // usedTemplates 중복 방지 (최대 3회 시도)
                let picked = pool[Math.floor(Math.random() * pool.length)];
                for (let t = 0; t < 3; t++) {
                    if (!usedTemplates.has(picked)) break;
                    picked = pool[Math.floor(Math.random() * pool.length)];
                }
                usedTemplates.add(picked);
                content = picked;
            } else if (midDensityPool.length > 0) {
                content = midDensityPool.pop()!;
            } else if (deepComments.length > 0) {
                content = deepComments.pop()!;
            } else {
                break;
            }
        } else {
            // GPT 풀 우선: 중간밀도 → deep → 없으면 템플릿 fallback
            if (midDensityPool.length > 0) {
                content = midDensityPool.pop()!;
            } else if (deepComments.length > 0) {
                content = deepComments.pop()!;
            } else {
                // GPT 풀 소진 시 템플릿으로 fallback
                const allTemplates = Object.values(lang.templates).flat();
                if (allTemplates.length > 0) {
                    content = allTemplates[Math.floor(Math.random() * allTemplates.length)];
                } else {
                    break;
                }
            }
        }
        content = lang.humanize(content);


        // 스케줄링된 공개 시간 사용
        const scheduledAt = scheduledTimes[i] || new Date();
        let createdAt: Date = scheduledAt;

        // 답글 10% (pool에 3개 이상 있을 때만)
        let parentId: string | null = null;
        if (Math.random() < 0.10 && commentPool.length >= 3) {
            const parentCommentId = weightedRandom(
                commentPool.map(c => ({ item: c.id, weight: c.reply_count > 0 ? 2.0 : 1.0 }))
            );
            parentId = parentCommentId;

            // #2 답글 시간 보정: 부모 댓글 시간 + 로그 정규 지연
            const parentComment = commentPool.find(c => c.id === parentCommentId);
            if (parentComment && parentComment.created_at) {
                const delayMs = replyDelay();
                createdAt = new Date(parentComment.created_at.getTime() + delayMs);
                // 미래를 넘지 않도록 (fallback: 1~72시간 랜덤)
                if (createdAt.getTime() > Date.now()) {
                    const fallbackMs = (3600000 + Math.random() * 71 * 3600000);
                    createdAt = new Date(parentComment.created_at.getTime() + fallbackMs);
                    if (createdAt.getTime() > Date.now()) {
                        createdAt = new Date(Date.now() - Math.random() * 3600000);
                    }
                }
            }

            if (parentComment) {
                const replyPrompt = lang.buildReplyPrompt(parentComment.content);
                const replyRaw = await callAzureGPT(replyPrompt);
                if (replyRaw) {
                    const replyClean = replyRaw.trim()
                        .replace(/^```.*\n?/i, '').replace(/\n?```.*$/i, '')
                        .replace(/^["']|["']$/g, '').trim();
                    if (replyClean.length > 0 && replyClean.length <= 50) {
                        content = replyClean;
                    }
                }
            }
        }

        // backfill: 즉시 표시 (과거 댓글), schedule: 숨김 + 예약
        const insertResult = backfill
            ? await db.query(
                `INSERT INTO comments (episode_id, user_id, content, parent_id, created_at, is_hidden)
                 VALUES ($1, $2, $3, $4, $5, FALSE) RETURNING id`,
                [episodeId, userId, content, parentId, createdAt]
            )
            : await db.query(
                `INSERT INTO comments (episode_id, user_id, content, parent_id, created_at, is_hidden, scheduled_at)
                 VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id`,
                [episodeId, userId, content, parentId, createdAt, scheduledAt]
            );

        commentPool.push({ id: insertResult.rows[0].id, content, reply_count: 0, created_at: createdAt });
        totalCommentsPosted++;

        // #3 likes 롱테일 분포
        const likes = randomLikes();
        if (likes > 0) {
            await db.query(`UPDATE comments SET likes = $1 WHERE id = $2`,
                [likes, insertResult.rows[0].id]);
        }

        await new Promise(resolve => setTimeout(resolve, 30));
    }

    console.log(`✅ [intl] Posted ${totalCommentsPosted} comments from ${botCount} bots (lang=${lang.code})`);

    return {
        inserted: totalCommentsPosted,
        episodeIds,
        deepContextUsed: useDeep,
        detectedTags: sceneTags,
        language: lang.code,
        contentLanguage,
    };
}

// ============================================================
// 배치 실행 — 소설의 모든 에피소드를 순회하며 동적 댓글 수 적용
// 조회수 + 화수 + 나이 기반으로 각 에피소드별 댓글 수 자동 결정
// ============================================================
export interface BatchResult {
    novelId: string;
    language: string;
    episodes: { episodeId: string; ep: number; views: number; daysSince: number; targetCount: number; inserted: number }[];
    totalInserted: number;
}

// ============================================================
// #4 상주 독자 시스템 (Zipf 분포 기반)
// 연구 근거:
//   - 90-9-1 Rule (Nielsen, 2006): 90% lurker, 9% occasional, 1% superuser
//   - Zipf's Law (α≈1): 소수 유저가 대다수 콘텐츠 생성
//   - Serial fiction retention ~50% drop per episode (BlogSpot study)
//   - Webtoon subscriber-to-reader ratio ~10% (Reddit community data)
// ============================================================
interface RecurringReader {
    userId: string;
    nickname: string;
    tier: 'superfan' | 'regular' | 'casual';
    // 등장 확률 (Zipf 가중치): superfan=0.8~1.0, regular=0.3~0.7, casual=0.05~0.15
    appearanceRate: number;
}

async function createRecurringReaderPool(
    lang: LanguagePack,
    totalEpisodes: number,
    firstPublishedAt: Date,
    backfill: boolean,
): Promise<RecurringReader[]> {
    const pool: RecurringReader[] = [];
    const usedNicknames = new Set<string>();

    // 풀 크기: 에피소드 수의 25~40% (최소 3, 최대 20)
    const poolSize = Math.max(3, Math.min(20, Math.ceil(totalEpisodes * 0.3)));

    // Zipf 기반 3-Tier 분포 (90-9-1 규칙 적용)
    const superfanCount = Math.max(1, Math.round(poolSize * 0.05));     // ~5%: 습퍼팬
    const regularCount = Math.max(1, Math.round(poolSize * 0.15));      // ~15%: 중급
    const casualCount = poolSize - superfanCount - regularCount;         // ~80%: 일반

    for (let i = 0; i < poolSize; i++) {
        const nickname = pickNickname(lang.nicknamePool, usedNicknames);
        const username = generateRealisticUsername(nickname);
        const pwHash = randomPasswordHash();

        // 계정 생성일: 소설 첥 에피소드 전 (상주 독자니까 초기부터 있어야 함)
        const userCreatedAt = backfill
            ? new Date(firstPublishedAt.getTime() - (7 + Math.random() * 180) * 86400000)
            : new Date();

        const userResult = await db.query(
            `INSERT INTO users(username, password_hash, name, is_hidden, role, created_at)
             VALUES($1, $2, $3, FALSE, 'bot', $4) RETURNING id`,
            [username, pwHash, nickname, userCreatedAt]
        );

        let tier: RecurringReader['tier'];
        let appearanceRate: number;

        if (i < superfanCount) {
            tier = 'superfan';
            appearanceRate = 0.80 + Math.random() * 0.20;  // 80~100%
        } else if (i < superfanCount + regularCount) {
            tier = 'regular';
            appearanceRate = 0.30 + Math.random() * 0.40;  // 30~70%
        } else {
            tier = 'casual';
            appearanceRate = 0.05 + Math.random() * 0.10;  // 5~15%
        }

        pool.push({
            userId: userResult.rows[0].id,
            nickname,
            tier,
            appearanceRate,
        });
    }

    console.log(`👥 [recurring] Created pool: ${superfanCount} superfans, ${regularCount} regulars, ${casualCount} casual (total=${poolSize})`);
    return pool;
}

export async function runCommentBotBatch(
    novelId: string,
    lang: LanguagePack,
    backfill: boolean = false,
): Promise<BatchResult> {
    console.log(`🚀 [batch] Starting ${backfill ? 'BACKFILL' : 'SCHEDULE'} for ${novelId} (lang=${lang.code})...`);

    // 모든 에피소드 조회 (views, ep번호, 게시일)
    const epResult = await db.query(
        `SELECT id, ep, views, created_at FROM episodes
         WHERE novel_id = $1 ORDER BY ep ASC`,
        [novelId]
    );

    if (epResult.rows.length === 0) {
        throw new Error(`No episodes found for ${novelId}`);
    }

    // #4 상주 독자 풀 생성 (Zipf 분포 기반)
    const firstPublishedAt = new Date(epResult.rows[0].created_at);
    const recurringPool = await createRecurringReaderPool(
        lang, epResult.rows.length, firstPublishedAt, backfill,
    );

    const now = new Date();
    const episodes: BatchResult['episodes'] = [];
    let totalInserted = 0;

    for (const row of epResult.rows) {
        const episodeId = row.id;
        const epNumber = parseInt(row.ep) || 1;
        const views = parseInt(row.views) || 0;
        const publishedAt = new Date(row.created_at);
        const daysSince = Math.floor((now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24));

        // 동적 댓글 수 계산
        const targetCount = calculateTargetCount(views, epNumber, daysSince);

        console.log(`📊 [batch] ep${epNumber}: views=${views}, age=${daysSince}d, target=${targetCount}`);

        if (targetCount === 0) {
            episodes.push({ episodeId, ep: epNumber, views, daysSince, targetCount: 0, inserted: 0 });
            continue;
        }

        // 에피소드별 상주 독자 배정: 각 독자의 appearanceRate로 등장 여부 결정
        // 후반 에피소드일수록 상주 독자 비율 높음 (retention 효과)
        const epProgress = Math.min(epNumber / epResult.rows.length, 1.0);
        const recurringBoost = 0.7 + epProgress * 0.3; // ep1=0.7x, epLast=1.0x
        const episodeRecurring = recurringPool.filter(r => {
            const adjusted = r.appearanceRate * recurringBoost;
            return Math.random() < adjusted;
        });

        try {
            const result = await runCommentBotIntl(
                novelId,
                lang,
                targetCount,
                1.0,
                true,
                episodeId,
                backfill,
                backfill ? publishedAt : undefined,
                episodeRecurring,
            );
            episodes.push({
                episodeId, ep: epNumber, views, daysSince,
                targetCount,
                inserted: result.inserted,
            });
            totalInserted += result.inserted;
        } catch (err) {
            console.error(`❌ [batch] ep${epNumber} failed:`, err);
            episodes.push({ episodeId, ep: epNumber, views, daysSince, targetCount, inserted: 0 });
        }
    }

    console.log(`✅ [batch] Finished: ${totalInserted} total comments across ${epResult.rows.length} episodes`);

    return {
        novelId,
        language: lang.code,
        episodes,
        totalInserted,
    };
}

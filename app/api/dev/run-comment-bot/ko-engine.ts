/**
 * ko-engine.ts — 한국어 전용 댓글 생성 엔진 (Worker 호출용)
 *
 * comment-bot-final(2026-02-17) 버전 로직.
 * next/server 의존성 없음 — worker에서 직접 import 가능.
 *
 * 파이프라인: 딥컨텍스트 70% / 중간밀도 20% / fallback 10%
 */

import db from '../../../db.js';

// ============================================================
// LLM 호출 로깅 (어드민 모니터링용)
// ============================================================
async function logLLMCall(provider: string, engine: string, success: boolean, latencyMs: number, fallbackUsed = false, errorMsg = '') {
    try {
        await db.query(
            `INSERT INTO llm_call_log (provider, engine, success, latency_ms, fallback_used, error_msg) VALUES ($1, $2, $3, $4, $5, $6)`,
            [provider, engine, success, latencyMs, fallbackUsed, errorMsg]
        );
    } catch { /* 로깅 실패해도 댓글 생성은 중단 안 함 */ }
}

// ============================================================
// Azure GPT 호출
// ============================================================
async function callAzureGPT(prompt: string, temperature = 0.9, maxTokens = 600): Promise<string> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-01-preview';
    const deployment = 'gpt-4omini';

    if (!endpoint || !apiKey) {
        console.warn('[ko-engine] ⚠️ Azure OpenAI not configured, skipping');
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
            console.error(`[ko-engine] Azure GPT error: ${response.status} → ${errorBody.substring(0, 200)}`);
            return '';
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
        console.error('[ko-engine] Azure GPT call failed:', err);
        return '';
    }
}

// ============================================================
// 장르 가중치
// ============================================================
const GENRE_CATEGORY_MAP: Record<string, string> = {
    'Romance': 'romance', 'Fantasy Romance': 'romance', 'Modern Romance': 'romance',
    'Fantasy': 'fantasy', 'Dark Fantasy': 'fantasy', 'Isekai': 'fantasy',
    'Action': 'action', 'Martial Arts': 'action', 'Hunter': 'action',
    'Regression': 'fantasy', 'Reincarnation': 'fantasy',
    'Horror': 'horror', 'Thriller': 'horror',
    'Comedy': 'comedy', 'Slice of Life': 'slice-of-life',
    'Historical': 'historical',
};

function getGenreWeights(genreData: string | string[] | null): Record<string, number> {
    if (!genreData) return {};
    const genres = Array.isArray(genreData) ? genreData : genreData.split(',').map((g: string) => g.trim());
    const counts: Record<string, number> = {};
    for (const genre of genres) {
        const cat = GENRE_CATEGORY_MAP[genre];
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return {};
    const weights: Record<string, number> = {};
    for (const [cat, count] of Object.entries(counts)) weights[cat] = count / total;
    return weights;
}


// ============================================================
// Grok API 호출 (댓글 생성용 — Azure GPT fallback)
// ============================================================
async function callGrokAPI(prompt: string, temperature = 0.9, maxTokens = 80): Promise<string> {
    const _grokStart = Date.now();
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return callAzureGPT(prompt, temperature, maxTokens);

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'grok-4-latest',
                messages: [{ role: 'user', content: prompt }],
                temperature,
                max_tokens: maxTokens,
                stream: false,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[grok] API error: ${response.status} → ${errorBody.substring(0, 200)}`);
            logLLMCall('grok', 'ko', false, Date.now() - _grokStart, true, `HTTP ${response.status}`);
            return callAzureGPT(prompt, temperature, maxTokens);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim() || '';
        logLLMCall('grok', 'ko', true, Date.now() - _grokStart);
        return result;
    } catch (err) {
        console.error('[grok] API call failed, falling back to Azure:', err);
        logLLMCall('grok', 'ko', false, Date.now() - _grokStart, true, String(err));
        return callAzureGPT(prompt, temperature, maxTokens);
    }
}

// ============================================================
// 빈 감탄사 필터 — "와 미쳤다", "대박이다" 등 내용 없는 댓글 제거
// ============================================================
function isEmptyExclamation(s: string): boolean {
    // 내용어 없이 감탄사 + 반응어로만 구성된 패턴
    const emptyPattern = /^(와|아|어|오|헐|대박|미쳤|진짜|실화|레전드|ㅅㅂ|ㄷㄷ|ㅋㅋ|ㅠㅠ|후|와씨|개|존나|진짜로|이게뭐야|뭐야)[\s!.ㅋㅠㄷ]*$/u;
    const genericPattern = /^(와|아|어|오|헐)[\s]*(진짜|대박|미쳤|좋아|대단|최고|레전드|ㄷㄷ|ㅋㅋ|ㅠㅠ|실화)?[\s!.]*$/u;
    return emptyPattern.test(s.trim()) || genericPattern.test(s.trim());
}

// ============================================================
// 개별 댓글 단건 생성 (방식 C)
// 더 긴 scene context + temperature 변주 + 내용 없는 댓글 필터
// ============================================================
async function generateSingleComment(
    episodeContent: string,
    primaryGenre: string,
    temperature: number,
    seedHint: string,
): Promise<string> {
    // #10: 마크다운 마크업 제거 전처리 (* ** [img:...] 등 LLM에 노출되면 이상한 댓글 생성 방지)
    const cleanContent = episodeContent.replace(/\*{1,3}|_{1,3}|\[img:[^\]]*\]|\[[^\]]*\]/g, '').trim();
    // 비용 무관: 최대 6000자 context 제공 (앞부분 + 뒷부분)
    const front = cleanContent.slice(0, 2000);
    const back = cleanContent.length > 2000 ? cleanContent.slice(-4000) : '';
    const context = back ? `${front}\n...(중략)...\n${back}` : front;

    const genreHint = primaryGenre === 'romance'
        ? '로맨스/감정 장면에 집중해서 반응해.'
        : primaryGenre === 'action'
            ? '전투/각성/반전 장면에 집중해서 반응해.'
            : '';

    const prompt = `너는 한국 웹소설 커뮤니티에서 방금 이 에피소드를 읽은 독자야.
${seedHint}

[규칙]
- 읽고 든 감상/의문/예측 중 하나만 짧게
- 장면을 설명하지 말고 독자 반응만
- 반응은 즉흥적이고 자연스럽게
- ㅋ, ㅠ, ㄷ, 초성체 자유롭게
- ~다 어미 금지 (미쳤음/ㅁㅊ OK)
- 이모지 금지
- 작품 전반 평가 금지 ("작가님 천재" 류 금지)
- 내용 없는 감탄사("와 미쳤다", "대박이다") 금지
${genreHint}

댓글 딱 1개만, 텍스트로 바로 출력:

${context}`;

    const raw = await callGrokAPI(prompt, temperature, 80);
    return raw.replace(/^["""'']+|["""'']+$/g, '').trim();
}

// comment style class — 댓글 의도 다변화 (scene reaction 단일 수렴 방지)
const COMMENT_STYLES: { weight: number; hint: string }[] = [
    { weight: 30, hint: '방금 읽은 장면에 즉각적으로 감정 반응해.' },
    { weight: 20, hint: '이 장면에서 생긴 궁금증이나 의문을 짧게 표현해.' },
    { weight: 20, hint: '이 전개가 다음에 어떻게 될지 짧게 예측해.' },
    { weight: 10, hint: '캐릭터 행동이나 설정의 의미를 짧게 해석해.' },
    { weight: 10, hint: '이 장면의 클리셰나 뻔한 전개를 드립으로 반응해.' },
    // DC 타입: 짧고 날 것의 반응 (기존 여초식 유지, 추가)
    { weight: 20, hint: '짧고 날 것의 반응. 예: "이거 회귀물이었냐" "설마 떡밥이었나" "다음화에서 터지겠네" "이번화 폼 미쳤네"' },
];

function pickCommentStyle(): string {
    const total = COMMENT_STYLES.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const cs of COMMENT_STYLES) { r -= cs.weight; if (r <= 0) return cs.hint; }
    return COMMENT_STYLES[0].hint;
}

// 에피소드를 paragraph 경계로 N개 청크 분할
// 문자 기반 슬라이스는 장면을 깨버리므로 단락 단위로 그룹핑
function extractSceneCandidates(content: string, n = 6): string[] {
    const paragraphs = content.split(/\n{2,}/).filter(p => p.trim().length > 20);
    if (paragraphs.length <= n) {
        // #8: size가 0이 되는 경계값 방지 (최소 50)
        const size = Math.max(50, Math.floor(content.length / n));
        return Array.from({ length: n }, (_, i) =>
            content.slice(i * size, (i + 1) * size + 200)
        );
    }
    const groupSize = Math.ceil(paragraphs.length / n);
    return Array.from({ length: n }, (_, i) =>
        paragraphs.slice(i * groupSize, (i + 1) * groupSize).join('\n\n')
    ).filter(c => c.trim().length > 0);
}

// ============================================================
// 딥컨텍스트 생성 — 개별 생성 방식 (방식 C)
// concurrency 5, temperature 변주, 빈 감탄사 필터
// ============================================================
async function generateDeepContextComments(
    episodeContent: string,
    genreWeights: Record<string, number>,
    count = 15,
    sourceLanguage = 'ko',
): Promise<{ comments: string[]; midComments: string[]; detectedTags: string[] }> {
    const primaryGenre = Object.entries(genreWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const temperatures = [0.7, 0.8, 0.9, 1.0, 1.1];
    const results: string[] = [];
    const CONCURRENCY = 5;

    // 에피소드를 paragraph 청크로 분할 → 호출마다 다른 청크 배정 (salience 수렴 방지)
    const chunks = extractSceneCandidates(episodeContent, 6);

    // concurrency pool — rate limit 방지
    for (let i = 0; i < count; i += CONCURRENCY) {
        const batch = Array.from({ length: Math.min(CONCURRENCY, count - i) }, (_, j) => {
            const idx = i + j;
            const chunk = chunks[idx % chunks.length];  // 청크 순환
            const styleHint = pickCommentStyle();         // 스타일 랜덤 배정
            const temp = temperatures[idx % temperatures.length];
            return generateSingleComment(chunk, primaryGenre, temp, styleHint);
        });
        const batchResults = await Promise.allSettled(batch);
        for (const r of batchResults) {
            if (r.status === 'fulfilled' && r.value) results.push(r.value);
        }
    }

    // 빈 감탄사 + 길이 필터
    const filtered = results
        .filter(c => c.length >= 2 && c.length < 120)
        .filter(c => !isEmptyExclamation(c));

    // #3: mid와 long을 완전히 분리 — filtered에서 mid를 제거해야 두 배열에 중복 삽입 안 됨
    // mid: 7~18자 짧은 댓글 (삽입 루프에서 midDensityPool로 사용)
    const midComments = filtered.filter(c => c.length >= 7 && c.length <= 18);
    // long: 19자 초과 댓글만 deepComments로 사용 (mid와 겹치지 않음)
    const longComments = filtered.filter(c => c.length > 18);

    // tags: 장르 태그 추론 (별도 GPT 호출 없이 genreWeights에서)
    const tagMap: Record<string, string> = {
        action: 'battle', romance: 'romance', horror: 'betrayal',
        fantasy: 'powerup', 'slice-of-life': 'comedy',
    };
    const detectedTags = Object.keys(genreWeights)
        .filter(k => genreWeights[k] > 0.3)
        .map(k => tagMap[k])
        .filter(Boolean);

    console.log(`   → [ko] 단건생성: ${results.length}개 생성, ${filtered.length}개 통과 (long:${longComments.length} mid:${midComments.length})`);
    return { comments: longComments, midComments, detectedTags };
}


// ============================================================
// 대댓글 생성
// ============================================================
async function generateContextualReply(parentComment: string): Promise<string> {
    const prompt = `너는 한국 웹소설 독자야.방금 다른 사람이 쓴 댓글을 봤어.


        ${parentComment}

이 댓글에 짧게 반응해줘.

[규칙]
        - 5~15자 이내 초단문
            - ㅇㅈ, ㄹㅇ, ㅋㅋ, ㅠㅠ 자유
                - 원댓글 맥락에 맞춰서
                    - ~다 어미 금지
                        - JSON 말고 댓글 텍스트만 출력`;

    // #6: 대댓글도 Grok → Azure fallback 체인으로 통일
    const raw = await callGrokAPI(prompt, 0.9, 100);
    let reply = raw
        .replace(/^```.*\n ? /i, '').replace(/\n ? ```.*$/i, '')
        .replace(/^[\"']|[\"']$/g, '')
        .replace(/^원댓글:.*?→\s*반응:\s*/g, '')
        .replace(/^반응:\s*/g, '')
        .replace(/^[\"']|[\"']$/g, '')
        .trim();
    return reply.length <= 50 ? reply : '';
}

// ============================================================
// 유틸
// ============================================================

function weightedRandom<T>(items: { item: T; weight: number }[]): T {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * total;
    for (const { item, weight } of items) {
        r -= weight;
        if (r <= 0) return item;
    }
    return items[items.length - 1].item;
}

const KO_NICKNAMES = [
    '뉴비독자', '정주행중', '밤샘독자', '덕후감성', '소설마니아',
    '웹소설러', '독서왕', '줄거리충', '감성충만', '원픽독자',
    '캐릭터빠', '작가님팬', '정독파', '속독왕', '눈팅러',
    '댓글러', '독서노트', '소설덕', '야간독서', '새벽독자',
    '1화부터', '정주행완', '후기남김', '리뷰어', '독자의눈',
    '첫화팬', '최애캐빠', '스압완독', '감동받음', '오열중',
];

function pickNickname(usedNicknames: Set<string>): string {
    const available = KO_NICKNAMES.filter(n => !usedNicknames.has(n));
    const pool = available.length > 0 ? available : KO_NICKNAMES;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    usedNicknames.add(picked);
    return picked;
}

// ============================================================
// trigram 유사도 기반 중복 제거 — 한국어 어절 단위 문제 해결
// 짧은 댓글: threshold 높임(0.75), 긴 댓글: 낮춤(0.60)
// ============================================================
function extractTrigrams(s: string): Set<string> {
    const clean = s.replace(/[ㅋㅠㅜ!?.,\s]/g, '');
    const tris = new Set<string>();
    for (let i = 0; i < clean.length - 2; i++) tris.add(clean.slice(i, i + 3));
    return tris;
}

function trigramSim(a: string, b: string): number {
    const ta = extractTrigrams(a), tb = extractTrigrams(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    const intersection = [...ta].filter(t => tb.has(t)).length;
    return intersection / Math.max(ta.size, tb.size);
}

function deduplicateComments(comments: string[]): string[] {
    // 짧은 댓글 false positive 방지: 15자 미만이면 threshold 높임
    const threshold = (s: string) => s.length < 15 ? 0.75 : 0.60;
    const passed: string[] = [];
    for (const c of comments) {
        const isDup = passed.some(p => trigramSim(c, p) >= threshold(c));
        if (!isDup) passed.push(c);
    }
    return passed;
}

// ============================================================
// LLM-as-Judge — 하위 30% 제거 (생성 모델 ≠ judge 모델)
// - JSON.parse 대신 /\d+/g 로 숫자 추출 (안정적)
// - temperature 0.1 (일관성 확보)
// - 실패 시 전량 통과 (서비스 안전)
// ============================================================
async function judgeComments(comments: string[]): Promise<string[]> {
    if (comments.length < 4) return comments; // 너무 적으면 skip

    // 제거 대상 수: 하위 30% (최소 1개)
    const removeCount = Math.max(1, Math.floor(comments.length * 0.3));

    const prompt = `너는 한국 웹소설 커뮤니티 댓글 품질 심사관이야.
아래 댓글 목록 중 가장 어색하거나 공식적인 댓글 ${removeCount}개의 번호를 골라줘.

제거 대상(이런 것만 골라):
- "[캐릭터명]의 [추상명사] ㄷㄷ" 같은 공식 템플릿
- 지나치게 깔끔하게 정리된 캐릭터/스토리 분석
- 문학 감상문 스타일
- 목록 내 다른 댓글과 동일한 장면·키워드를 반복 언급하는 댓글 (유사 댓글이 이미 있으면 2번째 이후는 제거)

살려야 할 것(이런 건 건드리지 마):
- 즉흥적이고 불완전한 반응("아 거기서 칼 빼네")
- 초성체, 줄임말, 구어체
- 장면에 대한 즉각적 감정 반응
- 서로 다른 장면이나 감정을 다루는 댓글

[댓글 목록]
${comments.map((c, i) => `${i + 1}. ${c}`).join('\n')}

제거할 번호만 나열해. 예: 2, 5, 7`;

    try {
        const raw = await callAzureGPT(prompt, 0.1, 100);
        // /\d+/g 로 숫자만 추출 (JSON.parse보다 안정적)
        const removeNums = new Set(
            (raw.match(/\d+/g) || [])
                .map(Number)
                .filter(n => n >= 1 && n <= comments.length)
                .slice(0, removeCount + 2) // 과잉 제거 방지
        );
        const result = comments.filter((_, i) => !removeNums.has(i + 1));
        // 과잉 제거 안전장치: 50% 미만 남으면 원본 반환
        if (result.length < comments.length * 0.5) {
            console.warn(`[ko - engine] Judge over - filtered(${result.length} / ${comments.length}), passing all`);
            return comments;
        }
        console.log(`[ko - engine] Judge: ${comments.length} → ${result.length} (removed ${removeNums.size})`);
        return result;
    } catch (err) {
        console.warn('[ko-engine] Judge failed, passing all through:', err);
        return comments;
    }
}

// ============================================================
// 콘텐츠 sanitization
// ============================================================
function sanitizeCommentContent(raw: string): string | null {
    let s = raw.trim();
    if (!s) return null;
    // 따옴표 전체 제거: 일반 + curly quote (“”‘’) — 어디에도 " 가 남지 않게
    s = s.replace(/["“”‘’']/g, '').trim();
    if (!s) return null;
    s = s.replace(/```[\s\S]*? ```/g, '').trim();
    if (!s) return null;
    // 라벨 접두어 제거: "대댓글:", "원댓글:", "A:" 등
    const labelRe = /^[^\s]{1,8}[：:] */;
    if (labelRe.test(s)) {
        const after = s.replace(labelRe, '').trim();
        if (after && !labelRe.test(after)) s = after;
        else return null;
        if (!s) return null;
    }
    const watermarkRe = /©|copyright|narra\.kr|AI training|unauthorized use|training data/i;
    if (watermarkRe.test(s)) return null;
    const jsonRe = /^\s*"[a-zA-Z_]+"\s*:\s*/m;
    if (jsonRe.test(s) || s.startsWith('{') || s.startsWith('[')) return null;
    if (/(.)\1{9,}/.test(s)) return null;
    if (s.length < 2 || s.length > 300) return null;
    return s;
}

function humanize(comment: string): string {
    const r = Math.random();
    if (r < 0.10 && !comment.includes('ㅋ') && comment.length < 20) comment += 'ㅋ';
    else if (r < 0.18 && !comment.includes('ㅠ') && comment.length < 20) comment += 'ㅠ';
    return comment.trim();
}

// ============================================================
// 메인 export
// ============================================================

export interface KoreanBotResult {
    inserted: number;
    deepContextUsed: boolean;
    detectedTags: string[];
    contentLanguage: string;
    episodeIds: string[];
}

export async function runKoreanCommentBot(
    novelId: string,
    count: number,
    episodeId: string,
    _isBackfill: boolean,
    publishedAt: Date,
    externalTimestamps?: Date[],
): Promise<KoreanBotResult> {
    const totalCount = count;
    console.log(`🤖[ko] Korean bot: novel = ${novelId} ep = ${episodeId} count = ${totalCount} `);

    // 기존 댓글 풀
    const existingResult = await db.query(
        `SELECT c.id, COALESCE(COUNT(r.id), 0) AS reply_count, c.content
         FROM comments c LEFT JOIN comments r ON r.parent_id = c.id
         WHERE c.episode_id = $1 GROUP BY c.id`,
        [episodeId]
    );
    const commentPool: { id: string; content: string; reply_count: number }[] = existingResult.rows.map(
        (r: { id: string; content: string; reply_count: string }) => ({
            id: r.id, content: r.content, reply_count: parseInt(r.reply_count) || 0,
        })
    );

    // 장르 + 언어
    const novelResult = await db.query(`SELECT genre, source_language FROM novels WHERE id = $1`, [novelId]);
    const genreData = novelResult.rows[0]?.genre;
    const sourceLanguage = novelResult.rows[0]?.source_language || 'ko';
    const genreWeights = getGenreWeights(genreData);

    // Deep context
    let deepComments: string[] = [];
    let midDensityPool: string[] = [];
    let sceneTags: string[] = [];

    const contentResult = await db.query(`SELECT content FROM episodes WHERE id = $1`, [episodeId]);
    const episodeContent = contentResult.rows[0]?.content;
    if (episodeContent && episodeContent.length > 50) {
        let calls = 0;
        let consecutiveEmpty = 0;
        while (deepComments.length < totalCount && calls < 6) {
            const result = await generateDeepContextComments(episodeContent, genreWeights, 15, sourceLanguage);
            deepComments.push(...result.comments);
            midDensityPool.push(...result.midComments);
            if (calls === 0) sceneTags = result.detectedTags;
            calls++;
            console.log(`   →[ko] 배치${calls}: +${result.comments.length} 개(총${deepComments.length} / ${totalCount})`);
            if (result.comments.length === 0 && result.midComments.length === 0) {
                consecutiveEmpty++;
                if (consecutiveEmpty >= 2) break;
            } else {
                consecutiveEmpty = 0;
            }
        }

        // ① 시맨틱 중복 제거 (LLM 호출 없이)
        deepComments = deduplicateComments(deepComments);
        midDensityPool = deduplicateComments(midDensityPool);

        // ② LLM-as-Judge — 배치 1회, 하위 30% 제거
        if (deepComments.length >= 4) {
            deepComments = await judgeComments(deepComments);
        }
    }

    // 닉네임 풀
    const nnResult = await db.query(
        `SELECT DISTINCT u.name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.episode_id = $1`,
        [episodeId]
    );
    const usedNicknames = new Set<string>(nnResult.rows.map((r: { name: string }) => r.name));

    // 타임슬롯
    const now = Date.now();
    const spanMs = now - publishedAt.getTime();
    const scheduledTimes: Date[] = externalTimestamps && externalTimestamps.length >= totalCount
        ? externalTimestamps.slice(0, totalCount).sort((a, b) => a.getTime() - b.getTime())
        : Array.from({ length: totalCount }, () => {
            const roll = Math.random();
            if (spanMs <= 0) return new Date(now + (1 + Math.random() * 14) * 60 * 1000);
            if (roll < 0.50) return new Date(publishedAt.getTime() + Math.random() * Math.min(spanMs, 24 * 3600 * 1000));
            if (roll < 0.75) {
                const f7 = Math.min(spanMs, 7 * 24 * 3600 * 1000);
                const off = 24 * 3600 * 1000 + Math.random() * (f7 - 24 * 3600 * 1000);
                return new Date(publishedAt.getTime() + (off < 0 ? Math.random() * spanMs : off));
            }
            return new Date(publishedAt.getTime() + Math.random() * spanMs);
        }).sort((a, b) => a.getTime() - b.getTime());

    let totalCommentsPosted = 0;
    // deepRatio: 에피소드당 1회 고정 (루프마다 재계산하면 의도한 비율 보장 안 됨)
    const deepRatio = 0.30 + (Math.random() * 0.20 - 0.10); // 20~40%

    for (let i = 0; i < totalCount && totalCommentsPosted < totalCount; i++) {
        // content 먼저 결정 — sanitize 실패해도 nickname/user 낭비 없음
        const roll = Math.random();
        let rawContent: string;
        if (roll < deepRatio && deepComments.length > 0) rawContent = deepComments.shift()!;
        else if (roll < deepRatio + 0.40 && midDensityPool.length > 0) rawContent = midDensityPool.shift()!;
        else if (deepComments.length > 0) rawContent = deepComments.shift()!;
        else if (midDensityPool.length > 0) rawContent = midDensityPool.shift()!;
        else break;

        // sanitize 먼저 — 실패 시 nickname·user INSERT 없이 skip (닉네임 중복 방지)
        const sanitized = sanitizeCommentContent(rawContent);
        if (!sanitized) continue;
        let content = humanize(sanitized);

        // content 검증 통과 후 nickname/user 생성
        const nickname = pickNickname(usedNicknames);
        const username = `bot_ko_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const userResult = await db.query(
            `INSERT INTO users(username, password_hash, name, is_hidden, role, created_at)
    VALUES($1, $2, $3, FALSE, 'bot', $4) RETURNING id`,
            [username, '$2b$10$placeholder_ko_bot', nickname, publishedAt]
        );
        const userId = userResult.rows[0].id;
        const scheduledAt = scheduledTimes[i] || new Date();

        // 답글 5%
        let parentId: string | null = null;
        if (Math.random() < 0.05 && commentPool.length > 0) {
            const parentCommentId = weightedRandom(
                commentPool.map(c => ({ item: c.id, weight: c.reply_count > 0 ? 2.0 : 1.0 }))
            );
            parentId = parentCommentId;
            const parentComment = commentPool.find(c => c.id === parentCommentId);
            if (parentComment) {
                const replyText = await generateContextualReply(parentComment.content);
                if (replyText) content = replyText;
            }
        }

        const insertResult = await db.query(
            `INSERT INTO comments(episode_id, user_id, content, parent_id, created_at, is_hidden, scheduled_at, bot_lang)
    VALUES($1, $2, $3, $4, $5, TRUE, $6, 'ko') RETURNING id`,
            [episodeId, userId, content, parentId, scheduledAt, scheduledAt]
        );
        commentPool.push({ id: insertResult.rows[0].id, content, reply_count: 0 });
        totalCommentsPosted++;
    }

    console.log(`✅[ko] ${totalCommentsPosted} Korean comments posted`);
    return {
        inserted: totalCommentsPosted,
        deepContextUsed: deepComments.length === 0 && totalCommentsPosted > 0,
        detectedTags: sceneTags,
        contentLanguage: sourceLanguage,
        episodeIds: [episodeId],
    };
}

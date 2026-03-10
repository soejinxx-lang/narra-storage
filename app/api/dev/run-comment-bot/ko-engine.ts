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
// 딥컨텍스트 생성 (comment-bot-final 버전 — generateDeepContextCommentsWithGenre)
// ============================================================
async function generateDeepContextComments(
    episodeContent: string,
    genreWeights: Record<string, number>,
    count = 15,
    sourceLanguage = 'ko',
): Promise<{ comments: string[]; midComments: string[]; detectedTags: string[] }> {
    const trimmed = episodeContent.length > 2000 ? episodeContent.slice(-2000) : episodeContent;
    const primaryGenre = Object.entries(genreWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    const prompt = `너는 한국 웹소설 독자야. 방금 이 에피소드를 읽었어.

[필수 절차]
1. 가장 꽂힌 장면 1개를 내부적으로 고른다 (출력 안 함)
2. 그 장면에서 생긴 감정 1개만 쓴다
3. 댓글에 장면 단서(행동/대사/수치/상황) 최소 1개를 포함한다

[출력 형식 — 반드시 JSON]
{
  "tags": ["이 에피소드의 장면 태그. battle/romance/betrayal/cliffhanger/comedy/powerup/death/reunion 중 해당하는 것만"],
  "comments": ["댓글 ${count}개"],
  "mid": ["7~18자 짧은 댓글 5개"]
}

[댓글 규칙]
- 5자 이하 초단문 3개, 한 줄 단문 4개, 두 줄 이상 1개
- ㅋㅋ, ㅠㅠ, ㄷㄷ, 초성체 자유
- ~다 어미 금지 (미쳤음/ㅁㅊ/미쳐 OK)
- 작품 전체 평가 금지
- 이모지 쓰지마
${primaryGenre === 'romance' ? '- 로맨스 장면 집중, 케미/심쿵 반응 허용' : ''}
${primaryGenre === 'action' ? '- 전투/각성 장면 집중, 체급/간지/사이다 허용' : ''}

[참고 예시]
거기서 칼 빼네
저 30퍼 터지네ㅋㅋ
웃다가 우는거 뭐임
아니 그걸 왜 지금 쒔
눈물에서 끝내냐

[에피소드 본문]
${trimmed}`;

    const raw = await callAzureGPT(prompt, 0.9, 800);
    if (!raw) return { comments: [], midComments: [], detectedTags: [] };

    const cleaned = raw.replace(/^```json\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    try {
        const parsed = JSON.parse(cleaned);
        const comments = (parsed.comments || [])
            .map((c: string) => c.replace(/^["\u201c\u2018']+|["\u201d\u2019']+$/g, '').trim())
            .filter((c: string) => c.length >= 2 && c.length < 100);
        const midComments = (parsed.mid || [])
            .map((c: string) => c.replace(/^["\u201c\u2018']+|["\u201d\u2019']+$/g, '').trim())
            .filter((c: string) => c.length >= 7 && c.length <= 18);
        const detectedTags = (parsed.tags || []).filter((t: string) =>
            ['battle', 'romance', 'betrayal', 'cliffhanger', 'comedy', 'powerup', 'death', 'reunion'].includes(t)
        );
        return { comments, midComments, detectedTags };
    } catch {
        const fallback = raw.split('\n')
            .map((l: string) => l.replace(/^\d+[\.)]\s*/, '').replace(/^["\u201c\u2018']+|["\u201d\u2019']+$/g, '').trim())
            .filter((l: string) => l.length >= 2 && l.length < 100);
        return { comments: fallback, midComments: [], detectedTags: [] };
    }
}

// ============================================================
// 대댓글 생성
// ============================================================
async function generateContextualReply(parentComment: string): Promise<string> {
    const prompt = `너는 한국 웹소설 독자야. 방금 다른 사람이 쓴 댓글을 봤어.


${parentComment}

이 댓글에 짧게 반응해줘.

[규칙]
- 5~15자 이내 초단문
- ㅇㅈ, ㄹㅇ, ㅋㅋ, ㅠㅠ 자유
- 원댓글 맥락에 맞춰서
- ~다 어미 금지
- JSON 말고 댓글 텍스트만 출력`;

    const raw = await callAzureGPT(prompt, 0.9, 100);
    let reply = raw
        .replace(/^```.*\n?/i, '').replace(/\n?```.*$/i, '')
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
// 시맨틱 중복 제거 (Judge 전 단계)
// 핵심 단어 기반 유사도 — LLM 호출 없이 처리
// ============================================================
function deduplicateComments(comments: string[]): string[] {
    const normalize = (s: string) =>
        s.replace(/[ㅋㅠㅜ!?.,\s]/g, '').slice(0, 15).toLowerCase();
    const seen = new Set<string>();
    return comments.filter(c => {
        const key = normalize(c);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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

제거 대상 (이런 것만 골라):
- "[캐릭터명]의 [추상명사] ㄷㄷ" 같은 공식 템플릿
- 지나치게 깔끔하게 정리된 캐릭터/스토리 분석
- 문학 감상문 스타일

살려야 할 것 (이런 건 건드리지 마):
- 즉흥적이고 불완전한 반응 ("아 거기서 칼 빼네")
- 초성체, 줄임말, 구어체
- 장면에 대한 즉각적 감정 반응

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
            console.warn(`[ko-engine] Judge over-filtered (${result.length}/${comments.length}), passing all`);
            return comments;
        }
        console.log(`[ko-engine] Judge: ${comments.length} → ${result.length} (removed ${removeNums.size})`);
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
    // 따옴표 제거: 일반 + curly quote (“”‘’)
    s = s.replace(/^["\u201c\u2018']+|["\u201d\u2019']+$/g, '').trim();
    if (!s) return null;
    s = s.replace(/```[\s\S]*?```/g, '').trim();
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
    console.log(`🤖[ko] Korean bot: novel=${novelId} ep=${episodeId} count=${totalCount}`);

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
            console.log(`   → [ko] 배치${calls}: +${result.comments.length}개 (총${deepComments.length}/${totalCount})`);
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

    for (let i = 0; i < totalCount && totalCommentsPosted < totalCount; i++) {
        const nickname = pickNickname(usedNicknames);
        const username = `bot_ko_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const userResult = await db.query(
            `INSERT INTO users(username, password_hash, name, is_hidden, role, created_at)
             VALUES($1, $2, $3, FALSE, 'bot', $4) RETURNING id`,
            [username, '$2b$10$placeholder_ko_bot', nickname, publishedAt]
        );
        const userId = userResult.rows[0].id;

        // 딥컨텍스트 70% / 중간밀도 20% / fallback
        const roll = Math.random();
        let content: string;
        if (roll < 0.70 && deepComments.length > 0) content = deepComments.pop()!;
        else if (roll < 0.90 && midDensityPool.length > 0) content = midDensityPool.pop()!;
        else if (deepComments.length > 0) content = deepComments.pop()!;
        else if (midDensityPool.length > 0) content = midDensityPool.pop()!;
        else break;

        content = humanize(content);
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
            `INSERT INTO comments (episode_id, user_id, content, parent_id, created_at, is_hidden, scheduled_at, bot_lang)
             VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'ko') RETURNING id`,
            [episodeId, userId, content, parentId, scheduledAt, scheduledAt]
        );
        commentPool.push({ id: insertResult.rows[0].id, content, reply_count: 0 });
        totalCommentsPosted++;
    }

    console.log(`✅ [ko] ${totalCommentsPosted} Korean comments posted`);
    return {
        inserted: totalCommentsPosted,
        deepContextUsed: deepComments.length === 0 && totalCommentsPosted > 0,
        detectedTags: sceneTags,
        contentLanguage: sourceLanguage,
        episodeIds: [episodeId],
    };
}

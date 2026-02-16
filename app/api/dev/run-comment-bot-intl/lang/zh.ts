/**
 * Chinese Language Pack — 起点/Webnovel Culture
 * Minimal viable implementation
 */

import type { LanguagePack, PersonalityTone, CallPromptArgs } from '../types';
import { ZH_NICKNAMES } from './data/zh_nicknames';
import { ZH_TEMPLATES } from './data/zh_templates';

const ZH_GENRE_WEIGHTS: Record<string, { tone: PersonalityTone; weight: number }[]> = {
    fantasy: [
        { tone: 'short_reactor', weight: 40 },
        { tone: 'emotional', weight: 30 },
        { tone: 'theorist', weight: 15 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    default: [
        { tone: 'short_reactor', weight: 40 },
        { tone: 'emotional', weight: 25 },
        { tone: 'theorist', weight: 15 },
        { tone: 'cheerleader', weight: 12 },
        { tone: 'critic', weight: 8 },
    ],
};

const zhLangPack: LanguagePack = {
    code: 'zh',
    dataMaturity: 'EXPERIMENTAL',
    nicknamePool: ZH_NICKNAMES,
    templates: ZH_TEMPLATES,
    genreTemplates: {},
    personas: [], // Minimal: use default 30 personas from engine
    genreWeights: ZH_GENRE_WEIGHTS,
    defaultWeights: ZH_GENRE_WEIGHTS.default,
    commentCountWeights: [
        { count: 1, weight: 60 },
        { count: 2, weight: 30 },
        { count: 3, weight: 10 },
    ],
    platformString: '起点/Webnovel',

    extractEventsPrompt: (trimmedContent) => `阅读以下章节内容，提取关键事件。

${trimmedContent}

输出JSON:
{ "events": [...], "dominantEmotion": "..." }`,

    buildCall1Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `读完章节。写下第一反应。

${args.sceneContext || 'N/A'}

${profileList}

不要总结。不要分析。随便写。
必须用中文。禁止英语。

生成${args.targetCommentCount}条评论。
JSON { "comments": [...] }`;
    },

    buildCall2Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `读完了。很爽。快速打字。

${args.sceneContext || 'N/A'}

${profileList}

展示兴奋但不解释原因。禁止分析。
必须用中文。禁止英语。

生成${args.targetCommentCount}条评论。
JSON { "comments": [...] }`;
    },

    buildCall3Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `读了但没专心。随便写点。

${args.sceneContext || 'N/A'}

${profileList}

迷糊、无聊、记错了。不纠正。
必须用中文。绝对不要用英语。

生成${args.targetCommentCount}条评论。
JSON { "comments": [...] }`;
    },

    buildCall4Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `读完章节。写即时感想。

${args.sceneContext || 'N/A'}

${profileList}

一个想法就够。禁止文学分析。
必须用中文。禁止英语。

生成${args.targetCommentCount}条评论。
JSON { "comments": [...] }`;
    },

    buildCall5Prompt: (args) => `网文章节评论区。以社区成员身份写。

${args.sceneContext || 'N/A'}

规则:
- 随便写。不要像书评。
- 可以句子没写完。
- 有些就一个态度: "666" "笑死" "绝了"

必须用中文。绝对不要用英语。

生成${args.targetCommentCount}条评论。
JSON { "comments": [...] }`,

    buildReplyPrompt: (parentComment) => `网文评论。回复这条:

"${parentComment}"

随便回。可以短。禁止书评语气。
必须用中文。

JSON { "reply": "..." }`,

    humanize: (comment) => {
        let result = comment;

        // 20% remove period
        if (Math.random() < 0.20) {
            result = result.replace(/。?$/, '');
        }

        // 15% add trailing
        if (Math.random() < 0.15) {
            const trailing = ['...', '...?', '啊', '呃', '哈'];
            result = result.replace(/。?$/, trailing[Math.floor(Math.random() * trailing.length)]);
        }

        // 5% add slang
        if (Math.random() < 0.05) {
            const slang = ['哈哈哈', '笑死', '绝了'];
            result += slang[Math.floor(Math.random() * slang.length)];
        }

        return result;
    },

    applyDynamicVariations: (text) => text,

    curateScoring: (comment) => {
        let score = 100;

        // Tier 1: Instant kill patterns
        const instantKill = [
            /文学手法|叙事技巧|结构完整/i,
            /值得深思|引人深思|发人深省/i,
        ];
        for (const pattern of instantKill) {
            if (pattern.test(comment)) return { score: 0 };
        }

        // Tier 2: Heavy penalty
        if (/这部作品|本章节|这段描写/.test(comment)) score -= 30;

        return { score };
    },

    extractKeyword: (text) => {
        const match = text.match(/[一-龥]{2,}/);
        return match ? match[0] : null;
    },

    herdEchoTemplates: (keyword) => [`对，${keyword}`, `就是${keyword}`, `${keyword}！`],
    herdCounterTemplates: (keyword) => [`不是${keyword}吧`, `${keyword}？`, `${keyword}有点...`],
    highEmotionPattern: /！|？{2,}|[哈]{3,}/,
    emotionBoosters: ['！', '！！', '哈哈哈', '太', '真的'],

    distortEventText: (summary) => summary,
    distortInterpretation: (summary, characters) => summary,

    stripLabel: (comment) => {
        return comment
            .replace(/^【.*?】/, '')
            .replace(/^\[.*?\]/, '')
            .replace(/^\d+\.\s*/, '')
            .trim();
    },

    minCommentLength: 2,
    maxCommentLength: 120,
    midDensityRange: [10, 60],

    applyPostNoise: (text) => text,
    tokenize: (text) => text.split('').filter(Boolean),

    // === Curator 프롬프트 (起点/Webnovel 페르소나) ===
    curatorPrompt: (commentList, targetCount) => `你在起点/Webnovel看了好几年。评论区快速扫。

有机器人混进来了。你的工作：挑看起来真实的。

别分析。别想规则。
就问：「在真实章节看到这个，我会想『等等，这是机器人』吗？」

起点读者很杂。有聪明的。大多数不是。
有略读的。有随便打字就走的。
评论太整齐就很怪。

选${targetCount}条，感觉像真人打的。

${commentList}

只要JSON:
{ "selected": [索引] }`,
};

export default zhLangPack;

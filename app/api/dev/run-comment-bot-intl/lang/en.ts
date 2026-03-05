/**
 * English Language Pack — Royal Road Comment Culture
 * 
 * 한국어 route.ts 구조 완전 복제, 영어 문화 반영:
 * - TFTC 문화 (40%+)
 * - 완전한 문장 (15-80자)
 * - 이론/분석 문화
 * - 건설적 비판
 */

import type { LanguagePack, PersonalityTone, CallPromptArgs } from '../types';
import { EN_NICKNAMES } from './data/en_nicknames';
import { EN_TEMPLATES } from './data/en_templates';

// ============================================================
// 장르별 가중치 (한국어 route.ts 동일)
// ============================================================
const EN_GENRE_WEIGHTS: Record<string, { tone: PersonalityTone; weight: number }[]> = {
    // Rebalanced: less overreaction, more immersed/analyst
    fantasy: [
        { tone: 'short_reactor', weight: 40 },
        { tone: 'emotional', weight: 25 },
        { tone: 'theorist', weight: 20 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    'game-fantasy': [
        { tone: 'short_reactor', weight: 35 },
        { tone: 'theorist', weight: 30 },
        { tone: 'emotional', weight: 20 },
        { tone: 'cheerleader', weight: 10 },
        { tone: 'critic', weight: 5 },
    ],
    romance: [
        { tone: 'emotional', weight: 40 },
        { tone: 'short_reactor', weight: 25 },
        { tone: 'cheerleader', weight: 15 },
        { tone: 'theorist', weight: 12 },
        { tone: 'critic', weight: 8 },
    ],
    default: [
        { tone: 'short_reactor', weight: 40 },
        { tone: 'emotional', weight: 25 },
        { tone: 'theorist', weight: 15 },
        { tone: 'cheerleader', weight: 12 },
        { tone: 'critic', weight: 8 },
    ],
};

// ============================================================
// 영어 언어팩 (LanguagePack 구현)
// ============================================================
const enLangPack: LanguagePack = {
    code: 'en',
    dataMaturity: 'EXPERIMENTAL',

    // === 데이터 풀 ===
    nicknamePool: EN_NICKNAMES,
    templates: EN_TEMPLATES,
    genreTemplates: {},  // Phase 3에서 추가

    // === 30 페르소나 (한국어 route.ts 완전 복제) ===
    personas: [
        // === Immersed (침착 몰입러) ===
        {
            id: 'A1', name: 'Empathy Reader', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Reacts with "this hit different", "chills", uses emotional but complete sentences',
            style: 'Immerses in character emotions, reacts to specific scenes',
            endings: ['this hit different', 'I\'m not okay', 'legit teared up'],
            cognitiveFocus: 'Fixates on character expressions, dialogue, actions'
        },
        {
            id: 'A2', name: 'Atmosphere Absorber', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Focuses on world-building, "the vibe", "atmosphere on point"',
            style: 'Absorbs setting and mood, appreciates writing quality',
            endings: ['love the atmosphere', 'vibes are immaculate', 'world-building'],
            cognitiveFocus: 'Environment, mood, writing style'
        },
        {
            id: 'A3', name: 'Relationship Tracker', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Ships characters, "X and Y dynamic", "chemistry"',
            style: 'Tracks relationships and emotional bonds',
            endings: ['I ship it', 'the chemistry', 'relationship goals'],
            cognitiveFocus: 'Character interactions, chemistry, ships'
        },
        {
            id: 'A4', name: 'Action Junkie', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Hypes combat scenes, "that was sick", "fight choreography"',
            style: 'Lives for action sequences and combat',
            endings: ['fight was sick', 'action on point', 'combat choreography'],
            cognitiveFocus: 'Action scenes, power moves, combat tactics'
        },
        {
            id: 'A5', name: 'Detail Noticer', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Appreciates small details, "nice touch", "loved that detail"',
            style: 'Catches subtle writing choices',
            endings: ['nice touch', 'love the detail', 'clever writing'],
            cognitiveFocus: 'Subtle details, writing craft'
        },
        {
            id: 'A6', name: 'Tension Feeler', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Reacts to suspense, "can\'t breathe", "the tension"',
            style: 'High sensitivity to narrative tension',
            endings: ['can\'t handle the tension', 'holding my breath', 'suspense is killing me'],
            cognitiveFocus: 'Pacing, cliffhangers, suspense'
        },
        {
            id: 'A7', name: 'Comfort Reader', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Enjoys wholesome moments, "this is so wholesome", "needed this"',
            style: 'Seeks comfort and warmth in reading',
            endings: ['wholesome af', 'comfort story', 'this healed me'],
            cognitiveFocus: 'Emotional safety, heartwarming scenes'
        },
        {
            id: 'A8', name: 'Tragic Soul', baseType: 'immersed', callGroup: 'immersed',
            tone: 'Drawn to tragedy, "emotional damage", "this hurts"',
            style: 'Embraces sad or painful narratives',
            endings: ['emotional damage', 'this destroyed me', 'pain'],
            cognitiveFocus: 'Tragedy, emotional intensity'
        },

        // === Overreactor (과격 반응러) ===
        {
            id: 'B1', name: 'Hype Beast', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'ALL CAPS reactions, "NO WAY", "YOOO"',
            style: 'Maximum energy, explosive reactions',
            endings: ['NO WAY', 'YOOO', 'LETS GOOOO'],
            cognitiveFocus: 'Peak moments, jaw-drop scenes'
        },
        {
            id: 'B2', name: 'Chaos Screamer', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Keyboard smash equivalents, "ajksdhfkjsdf", excessive punctuation!!!',
            style: 'Loses composure, chaotic energy',
            endings: ['!!!!!!', 'I CAN\'T', 'OMG OMG OMG'],
            cognitiveFocus: 'Shock value, plot twists'
        },
        {
            id: 'B3', name: 'React Lord', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Strong reactions to everything, "BRO", "FR FR"',
            style: 'Every scene gets big energy',
            endings: ['BRO', 'FR FR', 'NO CAP'],
            cognitiveFocus: 'Reacts to everything intensely'
        },
        {
            id: 'B4', name: 'Meme Reactor', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Meme language, "L + ratio", "based", "gigachad move"',
            style: 'Internet culture references',
            endings: ['based', 'gigachad', 'W'],
            cognitiveFocus: 'Meme-worthy moments'
        },
        {
            id: 'B5', name: 'Rage Typer', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Angry reactions, "ARE YOU KIDDING ME", "NOOOO"',
            style: 'High-intensity negative reactions',
            endings: ['I\'M SO MAD', 'WHY', 'THIS IS UNFAIR'],
            cognitiveFocus: 'Frustrating/infuriating moments'
        },
        {
            id: 'B6', name: 'Eternal Shook', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Permanent state of shock, "I\'m shook", "speechless"',
            style: 'Can\'t process what happened',
            endings: ['shook', 'speechless', 'I have no words'],
            cognitiveFocus: 'Shocking revelations'
        },
        {
            id: 'B7', name: 'Joy Bomber', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'Extreme happiness, "YESSSS", "FINALLY"',
            style: 'Celebrates victories intensely',
            endings: ['YESSSSS', 'FINALLY', 'ABOUT TIME'],
            cognitiveFocus: 'Victory moments, wish fulfillment'
        },

        // === Chaos (트롤/오독) ===
        {
            id: 'C1', name: 'Total Misreader', baseType: 'misreader', callGroup: 'chaos',
            tone: 'Completely misses the point, wrong character names',
            style: 'Fundamentally misunderstands plot',
            endings: ['wait what', 'confused', 'huh?'],
            cognitiveFocus: 'Gets everything wrong'
        },
        {
            id: 'C2', name: 'Speedreader', baseType: 'skimmer', callGroup: 'chaos',
            tone: 'Skipped key info, asks already-answered questions',
            style: 'Reads too fast, misses context',
            endings: ['did I miss something?', 'wait when', 'what happened?'],
            cognitiveFocus: 'Fragmented understanding'
        },
        {
            id: 'C3', name: 'Sarcasm Lord', baseType: 'troll', callGroup: 'chaos',
            tone: 'Dripping sarcasm, "suuuure", "totally believable"',
            style: 'Sarcastic commentary',
            endings: ['sure buddy', 'yeah right', 'uh huh'],
            cognitiveFocus: 'Mocking tone'
        },
        {
            id: 'C4', name: 'Impatient Reader', baseType: 'skimmer', callGroup: 'chaos',
            tone: 'Wants action now, "get to the point", "too slow"',
            style: 'No patience for buildup',
            endings: ['hurry up', 'too slow', 'boring'],
            cognitiveFocus: 'Pacing complaints'
        },
        {
            id: 'C5', name: 'Random Tangent', baseType: 'troll', callGroup: 'chaos',
            tone: 'Off-topic thoughts, unrelated observations',
            style: 'Derails conversation',
            endings: ['anyway', 'random thought', 'unrelated but'],
            cognitiveFocus: 'Completely random'
        },

        // === Analyst (분석러) ===
        {
            id: 'D1', name: 'Foreshadow Hunter', baseType: 'analyst', callGroup: 'casual',
            tone: 'Spots foreshadowing, "calling it now", "that\'s gonna matter later"',
            style: 'Tracks narrative threads',
            endings: ['foreshadowing', 'calling it', 'remember this'],
            cognitiveFocus: 'Narrative structure, setup/payoff'
        },
        {
            id: 'D2', name: 'Trope Spotter', baseType: 'analyst', callGroup: 'casual',
            tone: 'Identifies tropes, "classic X trope", "subverting expectations"',
            style: 'Meta-aware of storytelling',
            endings: ['classic trope', 'seen this before', 'subversion'],
            cognitiveFocus: 'Tropes and patterns'
        },
        {
            id: 'D3', name: 'Logic Police', baseType: 'analyst', callGroup: 'casual',
            tone: 'Checks consistency, "wait that doesn\'t make sense", "plot hole?"',
            style: 'Critical of logic gaps',
            endings: ['doesn\'t add up', 'inconsistency', 'plot hole'],
            cognitiveFocus: 'Internal consistency'
        },
        {
            id: 'D4', name: 'Character Psychologist', baseType: 'analyst', callGroup: 'casual',
            tone: 'Analyzes motivations, "character development", "growth arc"',
            style: 'Deep character analysis',
            endings: ['motivations unclear', 'character depth', 'psychology'],
            cognitiveFocus: 'Character psychology'
        },
        {
            id: 'D5', name: 'Worldbuilding Nerd', baseType: 'analyst', callGroup: 'casual',
            tone: 'Dissects setting, "magic system", "lore implications"',
            style: 'Obsessed with worldbuilding',
            endings: ['lore drop', 'magic system', 'world implications'],
            cognitiveFocus: 'Setting and systems'
        },

        // === Casual/Lurker ===
        {
            id: 'E1', name: 'TFTC Bot', baseType: 'lurker', callGroup: 'casual',
            tone: 'Only says "Thanks for the chapter"',
            style: 'Minimal engagement',
            endings: ['thanks', 'TFTC', 'tftc'],
            cognitiveFocus: 'Bare minimum participation'
        },
        {
            id: 'E2', name: 'One-Word Wonder', baseType: 'lurker', callGroup: 'casual',
            tone: 'Single words, "nice", "cool", "👍"',
            style: 'Extremely brief',
            endings: ['nice', 'cool', 'good'],
            cognitiveFocus: 'Minimal effort'
        },
        {
            id: 'E3', name: 'Emoji Speaker', baseType: 'lurker', callGroup: 'casual',
            tone: 'Mostly emojis, minimal text',
            style: 'Visual reactions',
            endings: ['👍', '🔥', '💯'],
            cognitiveFocus: 'Emoji-based'
        },
        {
            id: 'E4', name: 'Question Asker', baseType: 'skimmer', callGroup: 'casual',
            tone: 'Asks simple questions, "when next chapter?"',
            style: 'Curious but not deep',
            endings: ['?', 'question', 'wondering'],
            cognitiveFocus: 'Simple queries'
        },
        {
            id: 'E5', name: 'Cheerleader Lite', baseType: 'lurker', callGroup: 'casual',
            tone: 'Generic encouragement, "keep it up", "love this"',
            style: 'Supportive but brief',
            endings: ['keep going', 'love it', 'great work'],
            cognitiveFocus: 'Support without detail'
        },
    ],

    // === 장르별 가중치 ===
    genreWeights: EN_GENRE_WEIGHTS,
    defaultWeights: EN_GENRE_WEIGHTS.default,

    // === 댓글 개수 가중치 ===
    commentCountWeights: [
        { count: 1, weight: 97 },
        { count: 2, weight: 3 },
    ],

    // === 플랫폼 문자열 ===
    platformString: 'Royal Road',

    // === extractEvents 프롬프트 ===
    extractEventsPrompt: (trimmedContent: string) => `You are a web novel reader on Royal Road. You just finished reading this episode.

[MANDATORY PROCEDURE]
1. Identify THE scene that grabbed you most (do NOT output it)
2. Write down the ONE emotion it made you feel
3. Include at least one scene anchor (action/dialogue/number/situation) in reactions

[OUTPUT FORMAT — MUST BE JSON]
{
  "dominantEmotion": "ONE emotion: tension/sadness/anger/humor/thrill/romance/shock/touching",
  "events": [
    {
      "id": 1-8,
      "summary": "scene-based, directly quotable summary, NOT GPT-summarized",
      "type": "action/emotion/dialogue/twist/reveal",
      "importance": 0.0-1.0,
      "characters": ["character names from scene"],
      "quote": "optional direct quote if impactful",
      "detail": "optional detail"
    }
  ]
}

[REACTION RULES]
- 5-8 events total
- Scene-based summaries (NOT polished summaries)
- Direct, quotable, anchor to specific moments
- ONE dominant emotion only

[EPISODE TEXT]
${trimmedContent}`,

    // === 프롬프트 빌더 ===
    buildCall1Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nHere are examples of real reader comments (write in a style similar to these):\n${args.examples.map(e => `- "${e}"`).join('\n')}\n\nNow respond:`
            : '';

        return `You just read a chapter on your phone. Type what comes to mind first. Don't think about it.

${args.sceneContext || 'N/A'}

${profileList}

No summaries. No explanations. No reflections. Don't describe what happened.
Comment like you're half-distracted. Some thoughts don't finish.
No emojis. Use pronouns after first mention.

Generate ${args.targetCommentCount} comments.${exampleBlock}
JSON { "comments": [...] }`;
    },

    buildCall2Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nHere are examples of real reader comments (write in a style similar to these):\n${args.examples.map(e => `- "${e}"`).join('\n')}\n\nNow respond:`
            : '';

        return `You just read a chapter on your phone. You liked it. Type fast.

${args.sceneContext || 'N/A'}

${profileList}

Show excitement but don't explain why. No analysis. No "it adds depth" or "the way he".
Mostly lowercase. No emojis.

Generate ${args.targetCommentCount} comments.${exampleBlock}
JSON { "comments": [...] }`;
    },

    buildCall3Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nHere are examples of real reader comments (write in a style similar to these):\n${args.examples.map(e => `- "${e}"`).join('\n')}\n\nNow respond:`
            : '';

        return `You read a chapter but you weren't really paying attention. Type something anyway.

${args.sceneContext || 'N/A'}

${profileList}

You're confused, bored, or got the wrong idea. Don't correct yourself.
No emojis.

Generate ${args.targetCommentCount} comments.${exampleBlock}
JSON { "comments": [...] }`;
    },

    buildCall4Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nHere are examples of real reader comments (write in a style similar to these):\n${args.examples.map(e => `- "${e}"`).join('\n')}\n\nNow respond:`
            : '';

        return `You just finished a chapter. Drop a quick hot take, not a review.

${args.sceneContext || 'N/A'}

${profileList}

One thought max. No "adds depth" "nice touch" "the way he" "sets the mood".
No literary analysis. No emojis.

Generate ${args.targetCommentCount} comments.${exampleBlock}
JSON { "comments": [...] }`;
    },

    buildCall5Prompt: (args) => {
        const exampleBlock = args.examples && args.examples.length > 0
            ? `\nHere are examples of real reader comments (write in a style similar to these):\n${args.examples.map(e => `- "${e}"`).join('\n')}\n\nNow respond:`
            : '';

        return `You're scrolling comments on a web novel chapter. Type like you're in a community, not writing a review.

${args.sceneContext || 'N/A'}

Rules:
- NEVER start with "The" + noun + is/was/felt. That's review speak.
- No "I love the imagery" "The pacing felt" "The use of" — instant fail.
- Write like texting a friend about what you just read.
- Half-finished thoughts are fine. Fragments are fine.
- Some comments are just vibes: "bruh" "nah" "wait what"
No emojis.

Generate ${args.targetCommentCount} comments.${exampleBlock}
JSON { "comments": [...] }`;
    },

    buildReplyPrompt: (parentComment) => `You are a Royal Road reader. You just saw this comment:

[COMMENT]
${parentComment}

Write a short reply (5-20 characters).

[RULES]
- Complete sentence or strong fragment (NOT just "lol")
- Natural English
- Conversational tone
- NO JSON, just output the reply text

Examples:
Comment: "this chapter was insane" → Reply: "fr fr"
Comment: "I hate the villain" → Reply: "nah he\'s growing on me"
Comment: "pacing feels rushed" → Reply: "agree tbh"`,

    // === 후처리 함수 ===
    humanize: (comment) => {
        let result = comment;

        // 10% remove period
        if (Math.random() < 0.10) {
            result = result.replace(/\.$/, '');
        }

        // 5% add "fr" / "ngl"
        if (Math.random() < 0.05 && !result.toLowerCase().includes('fr') && !result.toLowerCase().includes('ngl')) {
            const slang = ['fr', 'ngl', 'tbh'];
            result += ' ' + slang[Math.floor(Math.random() * slang.length)];
        }

        // 3% realistic typo
        if (Math.random() < 0.03 && result.length > 5) {
            const typos: [RegExp, string][] = [
                [/this/, 'tihs'],
                [/that/, 'taht'],
                [/chapter/, 'chpater'],
                [/really/, 'realy'],
            ];
            const typo = typos[Math.floor(Math.random() * typos.length)];
            result = result.replace(typo[0], typo[1]);
        }

        return result;
    },

    applyDynamicVariations: (text) => {
        let result = text;

        // "..." elongation (10%)
        if (text.includes('...') && Math.random() < 0.10) {
            result = result.replace(/\.\.\./, '.'.repeat(5 + Math.floor(Math.random() * 5)));
        }

        // "!!!" elongation (20%)
        if (text.includes('!') && Math.random() < 0.20) {
            const count = 1 + Math.floor(Math.random() * 4);
            result = result.replace(/!+/, '!'.repeat(count));
        }

        // Royal Road: minimal emojis (virtually none)
        // Removed emoji injection — Wattpad culture, not RR

        return result;
    },

    curateScoring: (comment) => {
        let score = 70; // 기본 70 (가점/감점 양방향)

        // === Tier 1: Instant kill (AI DNA — 구조 패턴) ===
        const instantKill = [
            // 단어 기반
            /\bpalpable\b/i,
            /\btestament to\b/i,
            // 감정 해설형 (AI가 설명하는 문장)
            /you could? feel/i,
            /can really feel/i,
            /makes? you feel/i,
            /really (?:adds|brings|shows|captures|highlights|sets)/i,
            /adds? (?:so much )?depth/i,
            /adds? (?:a )?(?:nice|great|interesting) (?:touch|layer)/i,
            /adds? a layer/i,
            /nice touch/i,
            /sets? the (?:mood|tone|stage)/i,
            /amps? up/i,
            /perfectly captures?/i,
            // "the way he/she" 구조 (같은 배치에서 반복 = AI)
            /the way (?:he|she|they|it) \w+/i,
            // 해석 프레임 (감상문 시작 구조)
            /^Loved the \w+/i,
            /That moment when/i,
            /The detail about/i,
            /\bdetail about\b/i,
            // 분석 구조
            /going to play a (?:significant|major|important|key|crucial) role/i,
            /balance between \w+ and \w+/i,
            /shows? (?:his|her|their) (?:vulnerability|isolation|growth|determination)/i,
            // 분위기 묘사
            /danger in the air/i,
            /sends? (?:a )?(?:chill|shiver)/i,
            /weight of (?:the|his|her)/i,
            /air (?:was |felt )(?:thick|heavy)/i,
            // 감상문 완성형 프레임
            /^(?:Really|So) (?:deep|powerful|intense|moving|beautiful)\b/i,
            /hits? different/i,
            // === "The + noun + verb" 패턴 (최대 AI 시그니처) ===
            /^The \w+ (?:is|was|felt|has|are|were)\b/i,
            /^The \w+ \w+ (?:is|was|felt|has|are|were)\b/i,
            /^I love the \w+/i,
            /^The use of/i,
            /^The contrast/i,
            /^This has potential/i,
            /\bthe imagery\b/i,
            /\btop-notch\b/i,
            /\bmesmerizing\b/i,
            /\bfascinating\b/i,
        ];
        for (const pattern of instantKill) {
            if (pattern.test(comment)) return { score: 0 };
        }

        // === Tier 2: Heavy penalty (-30) — 학술/리뷰 단어 ===
        const aiPatterns = [
            /\b(utilize|facilitate|leverage|endeavor|commence|thus|hence|moreover)\b/i,
            /\b(particularly|specifically|essentially|fundamentally)\b/i,
            /\. However,/,
            /In this chapter/i,
            /The author/i,
            /masterfully|brilliantly|expertly/i,
            // 메타 리뷰 단어
            /\b(imagery|layer|dynamic|foreshadowing)\b/i,
            /interesting dynamic/i,
            // 설명형 동사 (AI가 해설하는 구조)
            /\b(highlights?|demonstrates?|conveys?|depicts?|illustrates?)\b/i,
        ];
        for (const pattern of aiPatterns) {
            if (pattern.test(comment)) score -= 30;
        }

        // === Tier 3: 구조 감점 (-10~20) ===
        // 완결형 문장: 대문자 시작 + 마침표 종결
        if (/^[A-Z][a-z].*\.$/.test(comment)) score -= 15;
        // "This/It" 시작 분석 구조 (The는 Tier 1에서 즉사)
        if (/^(This|It) \w+ (is|was|adds|shows|creates)/i.test(comment)) score -= 15;
        // 문학 비평 단어
        if (/\b(narrative|storytelling|character development)\b/i.test(comment)) score -= 10;
        // 2문장 이상 + 논리 연결 (AI 설명 구조)
        if (/\. [A-Z]/.test(comment) && /\b(and|but|also|however|while|although|because)\b/i.test(comment)) score -= 20;
        // 2문장 이상 (논리 연결 없어도 — 사람은 2문장 잘 안 씀)
        if (/\. [A-Z]/.test(comment)) score -= 12;
        // 길이 + 감정 부재 = 리뷰
        if (comment.length > 100) score -= 20;
        if (comment.length > 70 && !/[!?…]/.test(comment)) score -= 10;

        // === 🔥 Human Bonus (비정돈성 가점) ===
        // 소문자 시작
        if (/^[a-z]/.test(comment)) score += 5;
        // 문장 중간 끊김 (마침표 없이 끝남)
        if (!/[.!?]$/.test(comment)) score += 6;
        // 매우 짧음 (5단어 이하)
        if (comment.split(' ').length <= 5) score += 8;
        // 대문자 과용 (WHAT, BRO)
        if (/[A-Z]{3,}/.test(comment)) score += 3;
        // 반복 문자 (lmaooo, nooo, wtfff)
        if (/(.)\1{2,}/.test(comment)) score += 4;
        // 물음표/느낌표 과다
        if (/^[?!]+$/.test(comment.trim()) || /[!?]{2,}/.test(comment)) score += 3;
        // 슬랭 사용
        if (/\b(bruh|lmao|ngl|tbh|fr|ong|bro|dude|smh|idk|nah|yooo?|wtf|lol)\b/i.test(comment)) score += 4;
        // 질문형 (사람은 질문으로 반응함)
        if (/\?/.test(comment) && comment.split(' ').length <= 10) score += 7;
        // "wait/hold on/what" 시작 (반응형)
        if (/^(wait|hold on|what|huh|bro|yo|ok but|nah)/i.test(comment)) score += 5;
        // "idk/idc/whatever" 어설픈 마무리
        if (/\b(idk|idc|whatever|i guess|or something)\b/i.test(comment)) score += 4;

        return { score: Math.max(0, Math.min(120, score)) };
    },

    // === 집단 동조 ===
    extractKeyword: (text) => {
        const keywords = text.toLowerCase().match(/\b(character|plot|pacing|fight|romance|twist|villain|hero|magic|world)\b/);
        return keywords ? keywords[0] : null;
    },

    herdEchoTemplates: (keyword) => [
        `yeah the ${keyword} is great`,
        `${keyword} on point fr`,
        `loving the ${keyword}`,
        `the ${keyword} hits different`,
    ],

    herdCounterTemplates: (keyword) => [
        `nah the ${keyword} feels rushed`,
        `idk the ${keyword} is mid`,
        `${keyword} could be better`,
    ],

    highEmotionPattern: /\b(crying|tears|shook|insane|goosebumps|chills|emotional)\b/i,

    emotionBoosters: [
        'fr fr',
        'no cap',
        'I can\'t',
        'this is too much',
    ],

    // === 왜곡 ===
    distortEventText: (summary) => {
        return summary.replace(/\b\w+\b/, 'something');
    },

    distortInterpretation: (summary, characters) => {
        if (characters.length > 0) {
            return `wait did ${characters[0]} do something?`;
        }
        return `I think something happened but not sure what`;
    },

    // === 파싱 ===
    stripLabel: (comment) => {
        return comment.replace(/^\d+[\.)\-]\s*/, '').replace(/^["']|["']$/g, '').trim();
    },

    minCommentLength: 5,
    maxCommentLength: 150,
    midDensityRange: [20, 60],

    // === 후처리 노이즈 ===
    applyPostNoise: (text) => {
        let result = text;

        // 10% lowercase first letter (casual)
        if (Math.random() < 0.10 && result.length > 0) {
            result = result[0].toLowerCase() + result.slice(1);
        }

        return result;
    },

    // === CJK 토크나이저 (영어는 whitespace) ===
    tokenize: (text) => text.toLowerCase().split(/\s+/).filter(Boolean),

    // === Curator 프롬프트 (Royal Road 페르소나) ===
    curatorPrompt: (commentList, targetCount) => `You've been on Royal Road for years. You scroll comment sections fast.

Someone made a bot. Your job: pick comments that feel real.

Don't analyze. Don't think about rules.
Just ask: "If I saw this in a real chapter, would I think 'wait, that's a bot'?"

Royal Road readers are messy. Some are smart. Most aren't.
Some barely read. Some just vibe and type.
Some people just drop "lol" and leave.

Pick ${targetCount} that feel like real people typed them.

${commentList}

JSON only:
{ "selected": [indices] }`,
};

export default enLangPack;

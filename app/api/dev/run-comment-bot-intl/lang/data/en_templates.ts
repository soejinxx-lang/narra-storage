/**
 * 영어 댓글 템플릿 — Royal Road 문화 기반
 * 실제 수집 데이터 + 문화 분석 기반 생성
 */

import type { PersonalityTone, ContextTemplate } from '../types';

// ============================================================
// TEMPLATES — PersonalityTone별 범용 댓글
// ============================================================

export const EN_TEMPLATES: Record<PersonalityTone, string[]> = {
    // === SHORT_REACTOR (55%) — "TFTC" 문화 ===
    short_reactor: [
        // 실제 수집 데이터
        'Thanks for the chapter',
        'Thanks for the chapter!',
        'Thank you for the chapter!',
        'TFTC',
        'Tftc',
        'Tyftc',
        'Thanks',
        'Thanks 💗',
        'Thanks.♥️',
        'Danks fur da chappie!',
        'Tranks for the chapter!',
        'Thx for the chapter.',
        'Thanks for the chap!',
        'Tyvm',
        'Nice',
        '👍',
        'cool',
        'Ha, finally!',
        'Nice :)',
        'Noice',
        'thanks for the chap :)',
        '1st?',
        'Awesome :)',
        'Excellent chapter as always.',
    ],

    // === EMOTIONAL (20%) — 거친 반응, 파편형, I-문장 최소화 ===
    emotional: [
        // 실제 수집
        'I appreciate that you let us know when the POV switches',
        'I actually teared up',
        'I\'m so happy this isn\'t just me!',
        'Can\'t wait to see more',
        'I really like the way things are going',
        // 재작성 (파편형 + 거친 톤)
        'bro…',
        'nah',
        '?????',
        'why would you do this to me',
        'ok but WHY',
        'not ready for that',
        'nah this hurt',
        'bro that line',
        'chills',
        'this hit different',
        'actually crying rn',
        'emotional damage fr',
        'my heart',
        'can\'t breathe',
        'this is pain',
        'too wholesome i can\'t',
        'legit teared up',
        'wasn\'t prepared',
    ],

    // === THEORIST (10%) — 구어적 분석, 교과서 톤 제거 ===
    theorist: [
        // 실제 수집
        'The whole memories download thing always bugs me',
        'Nah this actually makes sense',
        'Makes me feel like the author really planned things out',
        'Makes the novel great for re-reading too',
        // 재작성 (구어적)
        'this is setup',
        'that\'s definitely coming back',
        'ok that line from earlier makes sense now',
        'nah this is bait',
        'calling it now',
        'foreshadowing for sure',
        'plot twist incoming',
        'bet that matters later',
        'author planned this',
        'worldbuilding lowkey crazy',
        'ok I see it now',
        'this connects to earlier',
        'character growth hits',
        'slow burn paying off',
        'that callback tho',
        'author playing chess fr',
    ],

    // === CHEERLEADER (10%) — hype/격려, 덜 safe ===
    cheerleader: [
        // 실제 수집
        'This novel is my comfort food',
        'Yes! So glad I don\'t have to wait until tomorrow to read this',
        'ok I\'m in it\'s well written',
        // 재작성 (더 hype, 덜 safe)
        'bro how is this free',
        'this is criminally underrated',
        'more ppl need to read this',
        'this deserves way more views',
        'keep it up!',
        'best story on here',
        'never disappoints',
        'this is top tier',
        'underrated af',
        'actually binge-worthy',
        'can\'t wait for next',
        'this story is a gem',
        'updates always worth it',
        'loving every chapter',
        'seriously well written',
        'you got a reader for life',
    ],

    // === CRITIC (5%) — 건설적 비판 ===
    critic: [
        // 실제 수집
        'damn is this how short chapters are? kinda discouraging',
        'Well that was short...',
        'This isn\'t a chapter. It\'s a sneeze',
        'I don\'t care how good you are at writing, if I can scroll your whole chapter with two moves of my thumb you need to start combining chapters',
        // 재작성 (약간 공격성, 교과서 톤 제거)
        'chapter felt short tbh',
        'lowkey rushed',
        'pacing feels off',
        'not sure about that choice',
        'chapter length inconsistent',
        'ending kinda abrupt',
        'too much exposition',
        'dialogue felt stiff',
        'transitions were rough',
        'felt like filler',
        'could be longer',
    ],
};

// ============================================================
// CONTEXT TEMPLATES — {name1}/{name2} 치환형
// ============================================================

export const EN_CONTEXT_TEMPLATES: ContextTemplate[] = [
    // 실제 데이터 기반
    { template: '{name1} is back!!!', tone: 'emotional' },
    { template: 'I missed {name1} so much', tone: 'emotional' },
    { template: 'Can\'t wait to see more {name1}', tone: 'emotional' },
    { template: 'Finally {name1} shows up', tone: 'short_reactor' },

    // 재작성 (구조 다양화)
    { template: '{name1} carried', tone: 'cheerleader' },
    { template: '{name1} and {name2} dynamic hits', tone: 'emotional' },
    { template: 'ok but {name1} tho', tone: 'short_reactor' },
    { template: 'loving the {name1} arc', tone: 'cheerleader' },
    { template: 'why is {name1} like this', tone: 'emotional' },
    { template: '{name1} deserves sm better', tone: 'emotional' },
    { template: 'the {name1} plot is heating up', tone: 'theorist' },
    { template: '{name1} growth this chapter', tone: 'cheerleader' },
    { template: '{name1} and {name2} interactions fr', tone: 'emotional' },
    { template: 'here for {name1} content', tone: 'short_reactor' },
    { template: '{name1} POV hits different', tone: 'emotional' },
    { template: 'author writes {name1} so well', tone: 'cheerleader' },
    { template: '{name1} lowkey best character', tone: 'theorist' },
    { template: 'more {name1} pls', tone: 'short_reactor' },
    { template: 'I ship {name1} and {name2}', tone: 'emotional' },
    { template: 'wait is {name1} gonna...?', tone: 'theorist' },
];

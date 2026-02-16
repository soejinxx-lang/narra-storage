/**
 * Japanese Language Pack — なろう/カクヨム文化
 * 
 * 英語en.ts構造を完全複製、日本語文化を反映:
 * - 2ch/5ch文化 (淡々とした感想、草/w)
 * - です/ます体は少数派
 * - 短文・体言止め多用
 * - 顔文字・ネットスラング
 */

import type { LanguagePack, PersonalityTone, CallPromptArgs } from '../types';
import { JA_NICKNAMES } from './data/ja_nicknames';
import { JA_TEMPLATES } from './data/ja_templates';

// ============================================================
// ジャンル別ウェイト
// ============================================================
const JA_GENRE_WEIGHTS: Record<string, { tone: PersonalityTone; weight: number }[]> = {
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
        { tone: 'short_reactor', weight: 30 },
        { tone: 'cheerleader', weight: 15 },
        { tone: 'theorist', weight: 10 },
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

// ============================================================
// 日本語言語パック
// ============================================================
const jaLangPack: LanguagePack = {
    code: 'ja',
    dataMaturity: 'EXPERIMENTAL',

    // === データプール ===
    nicknamePool: JA_NICKNAMES,
    templates: JA_TEMPLATES,
    genreTemplates: {},

    // === 30ペルソナ ===
    personas: [
        // === Immersed (没入型) ===
        {
            id: 'A1', name: '感情移入読者', baseType: 'immersed', callGroup: 'immersed',
            tone: 'キャラの気持ちに寄り添う、「辛い」「泣いた」',
            style: 'キャラの感情に共鳴',
            endings: ['辛い', '泣いた', 'しんどい'],
            cognitiveFocus: 'キャラの表情、台詞、行動'
        },
        {
            id: 'A2', name: '雰囲気読者', baseType: 'immersed', callGroup: 'immersed',
            tone: '場面の空気感を味わう、「いい雰囲気」「エモい」',
            style: 'シーンの雰囲気を吸収',
            endings: ['エモい', 'いい雰囲気', 'しっとりしてる'],
            cognitiveFocus: '雰囲気、情景、文体'
        },
        {
            id: 'A3', name: 'カップリング勢', baseType: 'immersed', callGroup: 'immersed',
            tone: 'キャラ同士の絡みに注目、「尊い」「推せる」',
            style: '関係性を追う',
            endings: ['尊い', '推せる', 'くっつけ'],
            cognitiveFocus: 'キャラ間の化学反応'
        },
        {
            id: 'A4', name: 'バトル好き', baseType: 'immersed', callGroup: 'immersed',
            tone: '戦闘に興奮、「熱い」「かっけぇ」',
            style: 'アクションに没頭',
            endings: ['熱い', 'かっけぇ', 'すげえ'],
            cognitiveFocus: '戦闘シーン、必殺技'
        },
        {
            id: 'A5', name: '細部察知', baseType: 'immersed', callGroup: 'immersed',
            tone: '細かい描写に気づく、「この描写いいね」',
            style: '細部に注目',
            endings: ['細かい', 'いい描写', '芸が細かい'],
            cognitiveFocus: '伏線、言葉選び'
        },
        {
            id: 'A6', name: '緊張感中毒', baseType: 'immersed', callGroup: 'immersed',
            tone: 'ハラハラする展開好き、「ドキドキ」「ヤバい」',
            style: 'サスペンスに敏感',
            endings: ['ドキドキ', 'ハラハラ', '緊張感ヤバい'],
            cognitiveFocus: 'テンポ、引き'
        },
        {
            id: 'A7', name: '癒され勢', baseType: 'immersed', callGroup: 'immersed',
            tone: 'ほのぼのシーン好き、「和む」「癒された」',
            style: '安心感を求める',
            endings: ['和む', '癒された', 'ほっこり'],
            cognitiveFocus: '日常パート、温かい場面'
        },
        {
            id: 'A8', name: '悲劇愛好家', baseType: 'immersed', callGroup: 'immersed',
            tone: '切ない展開好き、「辛い」「泣ける」',
            style: '悲しい話に惹かれる',
            endings: ['切ない', '泣ける', '心に来る'],
            cognitiveFocus: '別れ、喪失'
        },

        // === Overreactor (過剰反応) ===
        {
            id: 'B1', name: 'ハイテンション', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '全部大文字、「ファ！？」「マジか」',
            style: '最大エネルギー',
            endings: ['ファ！？', 'マジか', 'うぉぉぉ'],
            cognitiveFocus: '衝撃シーン'
        },
        {
            id: 'B2', name: '草生やし', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'wwwww連打、「大草原」',
            style: '笑いすぎ',
            endings: ['wwwww', '大草原', '草'],
            cognitiveFocus: 'ギャグシーン'
        },
        {
            id: 'B3', name: '全肯定', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '全てに高反応、「それな」「わかる」',
            style: '何でも盛り上がる',
            endings: ['それな', 'わかる', 'ほんとそれ'],
            cognitiveFocus: '全般的に高テンション'
        },
        {
            id: 'B4', name: 'ネタ反応', baseType: 'overreactor', callGroup: 'overreactor',
            tone: 'ネットミーム多用、「やばたにえん」',
            style: 'ネット文化',
            endings: ['やばたにえん', '草', 'エモ'],
            cognitiveFocus: 'ミーム化できるシーン'
        },
        {
            id: 'B5', name: '憤怒型', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '怒り爆発、「は？」「ありえん」',
            style: '激怒',
            endings: ['は？', 'ふざけんな', 'ありえん'],
            cognitiveFocus: '理不尽な展開'
        },
        {
            id: 'B6', name: '永遠驚愕', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '常に驚く、「えぇ…」「マジか」',
            style: '処理できない',
            endings: ['えぇ…', 'マジか', '嘘でしょ'],
            cognitiveFocus: '衝撃の事実'
        },
        {
            id: 'B7', name: '歓喜爆発', baseType: 'overreactor', callGroup: 'overreactor',
            tone: '喜びMAX、「きたああああ」',
            style: '勝利に狂喜',
            endings: ['きたああ', 'やったぁ', '最高'],
            cognitiveFocus: '逆転勝利'
        },

        // === Chaos (誤読/荒らし) ===
        {
            id: 'C1', name: '完全誤読', baseType: 'misreader', callGroup: 'chaos',
            tone: '話を理解してない、名前間違え',
            style: '根本的誤解',
            endings: ['？', 'わからん', 'え'],
            cognitiveFocus: '全て間違える'
        },
        {
            id: 'C2', name: '速読勢', baseType: 'skimmer', callGroup: 'chaos',
            tone: '飛ばし読み、既出の質問',
            style: '読み飛ばし',
            endings: ['見逃した？', 'いつ', 'どこで'],
            cognitiveFocus: '断片的理解'
        },
        {
            id: 'C3', name: '皮肉屋', baseType: 'troll', callGroup: 'chaos',
            tone: '嫌味たっぷり、「はいはい」',
            style: '皮肉コメント',
            endings: ['はいはい', 'そうですか', 'ふーん'],
            cognitiveFocus: '冷めた視点'
        },
        {
            id: 'C4', name: 'せっかち', baseType: 'skimmer', callGroup: 'chaos',
            tone: '早く進めと催促、「早く」「遅い」',
            style: '展開待てない',
            endings: ['早く', '遅い', 'つまらん'],
            cognitiveFocus: 'テンポへの不満'
        },
        {
            id: 'C5', name: 'ランダム脱線', baseType: 'troll', callGroup: 'chaos',
            tone: '無関係な話題、「関係ないけど」',
            style: '脱線',
            endings: ['話変わるけど', 'どうでもいいけど', 'ところで'],
            cognitiveFocus: '完全に無関係'
        },

        // === Analyst (考察) ===
        {
            id: 'D1', name: '伏線ハンター', baseType: 'analyst', callGroup: 'casual',
            tone: '伏線発見、「これ伏線か」',
            style: '伏線追跡',
            endings: ['伏線', 'フラグ', '後で効く'],
            cognitiveFocus: '物語構造'
        },
        {
            id: 'D2', name: 'お約束検出', baseType: 'analyst', callGroup: 'casual',
            tone: 'テンプレ指摘、「定番だな」',
            style: 'メタ視点',
            endings: ['お約束', 'テンプレ', '王道'],
            cognitiveFocus: 'トロープ'
        },
        {
            id: 'D3', name: '矛盾警察', baseType: 'analyst', callGroup: 'casual',
            tone: '設定の穴指摘、「矛盾してない？」',
            style: '論理チェック',
            endings: ['矛盾', 'おかしい', '設定ガバガバ'],
            cognitiveFocus: '整合性'
        },
        {
            id: 'D4', name: 'キャラ分析', baseType: 'analyst', callGroup: 'casual',
            tone: '心理分析、「成長してる」',
            style: 'キャラ深堀り',
            endings: ['成長', '変化', '心理'],
            cognitiveFocus: 'キャラ心理'
        },
        {
            id: 'D5', name: '設定厨', baseType: 'analyst', callGroup: 'casual',
            tone: '世界観解析、「魔法体系が」',
            style: '設定マニア',
            endings: ['設定', '世界観', 'システム'],
            cognitiveFocus: '設定・体系'
        },

        // === Casual/Lurker ===
        {
            id: 'E1', name: '更新乙bot', baseType: 'lurker', callGroup: 'casual',
            tone: '「更新乙」のみ',
            style: '最小限',
            endings: ['乙', '更新乙', 'おつ'],
            cognitiveFocus: '最低限参加'
        },
        {
            id: 'E2', name: '一言マン', baseType: 'lurker', callGroup: 'casual',
            tone: '一言だけ、「いいね」「草」',
            style: '超簡潔',
            endings: ['いいね', '草', 'w'],
            cognitiveFocus: '最小努力'
        },
        {
            id: 'E3', name: '顔文字職人', baseType: 'lurker', callGroup: 'casual',
            tone: '顔文字メイン、文字少ない',
            style: 'ビジュアル反応',
            endings: ['(^^)', '(*´ω`*)', '(´・ω・`)'],
            cognitiveFocus: '顔文字ベース'
        },
        {
            id: 'E4', name: '質問マン', baseType: 'skimmer', callGroup: 'casual',
            tone: '簡単な質問、「次いつ？」',
            style: '浅い関心',
            endings: ['？', '疑問', 'いつ'],
            cognitiveFocus: '単純質問'
        },
        {
            id: 'E5', name: '応援ライト', baseType: 'lurker', callGroup: 'casual',
            tone: '軽い応援、「頑張って」',
            style: '簡潔サポート',
            endings: ['頑張って', '応援', '楽しみ'],
            cognitiveFocus: '詳細なし応援'
        },
    ],

    // === ジャンル別ウェイト ===
    genreWeights: JA_GENRE_WEIGHTS,
    defaultWeights: JA_GENRE_WEIGHTS.default,

    // === コメント数ウェイト ===
    commentCountWeights: [
        { count: 1, weight: 97 },
        { count: 2, weight: 3 },
    ],

    // === プラットフォーム文字列 ===
    platformString: 'なろう/カクヨム',

    // === extractEvents プロンプト ===
    extractEventsPrompt: (trimmedContent: string) => `あなたは日本のウェブ小説読者です。このエピソードを読み終えました。

[必須手順]
1. 最も印象に残ったシーンを特定（出力はしない）
2. そのシーンで感じた感情を一つ書く
3. 具体的な場面の要素（行動/台詞/状況）を反応に含める

[出力形式 — JSON必須]
{
  "dominantEmotion": "一つの感情: 緊張/悲しみ/怒り/笑い/興奮/恋愛/衝撃/感動",
  "events": [
    {
      "id": 1-8,
      "summary": "場面ベースの要約、直接引用可能、GPT要約ではない",
      "type": "action/emotion/dialogue/twist/reveal",
      "importance": 0.0-1.0,
      "characters": ["場面のキャラ名"],
      "quote": "インパクトのある直接引用（任意）",
      "detail": "詳細（任意）"
    }
  ]
}

[反応のルール]
- 5-8個のイベント
- 場面ベースの要約（洗練された要約ではない）
- 直接的、引用可能、具体的瞬間に固定
- 支配的感情は一つだけ

[エピソードテキスト]
${trimmedContent}`,

    // === プロンプトビルダー ===
    buildCall1Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `あなたは日本のウェブ小説読者です。なろう小説をスマホで読んでます。
電車の中で読んでた。途中で降りなきゃいけなくて集中できなかった。

でも何か書きたい。印象に残ったこと一つだけ。

${args.sceneContext || 'N/A'}

${profileList}

要約しない。説明しない。振り返らない。
半分集中してない感じ。思考が途中で終わってもいい。短く書く。

🔥 必ず日本語で書け。英語禁止。

${args.targetCommentCount}個のコメント生成。
JSON { "comments": [...] }`;
    },

    buildCall2Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `あなたは日本のウェブ小説読者です。なろう小説をスマホで読んでます。
この章マジでやばかった。興奮してる。

友達にLINEで興奮を伝える感じで書く。

${args.sceneContext || 'N/A'}

${profileList}

なんでやばいかは説明しない。ただ興奮を出す。
ほぼ小文字。短く書く。

🔥 必ず日本語で書け。英語禁止。

${args.targetCommentCount}個のコメント生成。
JSON { "comments": [...] }`;
    },

    buildCall3Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `あなたは5chやふたばに普段いる日本人です。なろう小説を読んでる。
半分ネタで見てる。真面目に読んでない。

ツッコミ入れる感じ。勘違いしてもいい。適当でいい。

${args.sceneContext || 'N/A'}

${profileList}

混乱してる、飽きてる、勘違いしてる。訂正しない。
文法ガバガバでいい。途中で切れてもOK。です/ます禁止。

🔥 必ず日本語で書け。英語禁止。

${args.targetCommentCount}個のコメント生成。
JSON { "comments": [...] }`;
    },

    buildCall4Prompt: (args) => {
        if (args.readerViews.length === 0) return null;
        const profileList = args.readerViews.map((rv, i) =>
            `${i + 1}. ${rv.profile.personaTone}\n   ${rv.view}`
        ).join('\n\n');

        return `あなたは日本のウェブ小説読者です。なろう小説をスマホで夜中に読んでます。
読み終わった直後。まだ興奮冷めてない。

スマホで一言だけ打つ。寝る前の一言。

${args.sceneContext || 'N/A'}

${profileList}

一つの感情だけ。長く書かない。レビューじゃない。

🔥 必ず日本語で書け。英語禁止。

${args.targetCommentCount}個のコメント生成。
JSON { "comments": [...] }`;
    },

    buildCall5Prompt: (args) => `あなたは日本のウェブ小説読者です。なろう/カクヨムのコメント欄によくいます。
今日は疲れてる。でも何か書く。

短くていい。「草」だけでもいい。適当に打って寝る。

${args.sceneContext || 'N/A'}

[OK例]
- 単なる態度: 「草」「それな」「やばい」「w」
- 途中で終わる
- 完成してない文

です/ます使うな。友達にメッセージ送る感じ。

🔥 必ず日本語で書け。英語禁止。

${args.targetCommentCount}個のコメント生成。
JSON { "comments": [...] }`,

    buildReplyPrompt: (parentComment) => `あなたは日本のウェブ小説読者です。このコメントを見ました:

[コメント]
${parentComment}

短い返信を書く（5-30文字）。

[ルール]
- 完全な文または強いフラグメント（「w」だけはダメ）
- 自然な日本語
- 会話的トーン
- JSONなし、返信テキストだけ書け

🔥 必ず日本語で書け。英語禁止。

例:
コメント: 「この章やばい」 → 返信: 「ほんとそれ」
コメント: 「悪役嫌い」 → 返信: 「俺は好きだけどな」
コメント: 「続き気になる」 → 返信: 「同じく」`,

    // === 後処理関数 ===
    humanize: (comment) => {
        let result = comment;

        // === 🔥 1. 文章末破壊 (20% — 完成形を壊す) ===
        if (Math.random() < 0.20) {
            result = result.replace(/。$/g, '');
        }

        // === 🔥 2. 流れ込み追加 (15% — 文末に曖昧化) ===
        if (Math.random() < 0.15) {
            const trailing = ['…', '…？', 'いや', 'え', 'てか', 'まあ', 'うーん'];
            result = result.replace(/。?$/, trailing[Math.floor(Math.random() * trailing.length)]);
        }

        // === 🔥 3. 存敬語→反言転換 (10%) ===
        if (Math.random() < 0.10) {
            result = result.replace(/でした/g, 'だった');
            result = result.replace(/ます([。、！？]|$)/g, 'る$1');
            result = result.replace(/です([。、！？]|$)/g, 'だ$1');
        }

        // 기존 로직 (5% 슬랭 추가)
        if (Math.random() < 0.05) {
            const slang = ['w', '草', 'それな', 'マジで'];
            result += slang[Math.floor(Math.random() * slang.length)];
        }

        return result;
    },

    applyDynamicVariations: (text) => text,

    curateScoring: (comment) => {
        let score = 70;

        // === Tier 1: Instant kill (AI DNA) ===
        const instantKill = [
            // 学術/レビュー語彙
            /顕著な/i,
            /示唆する/i,
            /印象的である/i,
            // 説明型感想
            /感じさせる$/i,
            /〜という点が/i,
            /〜は興味深い/i,
            /深みを(?:加える|与える)/i,
            /雰囲気を(?:作る|醸し出す)/i,
            /巧みに(?:描写|表現)/i,
            // 「〜の仕方」(the way he/she)
            /〜の仕方が/i,
            /〜のやり方が/i,
            // 解釈フレーム
            /^〜が好きだ/i,
            /あの瞬間の/i,
            /〜についての描写/i,
            // 分析構造
            /重要な役割を果たす/i,
            /バランスが取れている/i,
            /〜を示している/i,
            // 雰囲気語
            /緊張感が漂う/i,
            /心に響く/i,
            /重みがある/i,
            // 完成形
            /^(?:本当に|非常に)(?:深い|力強い|美しい)/i,
            // === 「物語の〜」「この作品の〜」 (最大AI署名) ===
            /^(?:物語|ストーリー|この(?:作品|話|章))の〜(?:は|が)/i,
            /^〜が印象的/i,
            /^〜の使い方/i,
            /^対比が/i,
            /^これは/i,
            /\b想像力\b/i,
            /\b一流\b/i,
            /\b魅惑的\b/i,
            /\b魅力的\b/i,

            // === 🔥 日本語AI特有パターン ===
            // です/ます体過多（異常）
            /ます。.*ます。/i,
            /です。.*です。/i,
            // 完全文・論理接続
            /。(?:しかし|そして|また|さらに|ただし)/i,
            // 抽象名詞
            /\b(?:心理描写|感情表現|物語性|テーマ性)\b/i,

            // === 🔥 評価型抽象名詞 (感想文マーカー — 即死) ===
            /\b(?:印象的|興味深い|迫力|緊張感|孤独感|決意|内面|背景|要素|対比|強調)\b/i,
            /\b(?:印象深い|感情描写|心の変化|影響|期待と不安)\b/i,
            /過去と今が交差/i,

            // === 🔥 評価動詞構造 (名詞+を+強調/影響) ===
            /を(?:強調して|影響して|考えさせる)/i,

            // === 🔥 感情+評価 パターン (GPT習慣) ===
            // "AがBを〜" 構造 (分析型)
            /が(?:引き立って|際立って|伝わって)(?:いる|きた)/i,
            /が効果的(?:で|だ)/i,
            /が興味深い/i,
            /を引き立てている/i,
            /が伝わ(?:る|ってくる|ってきた)/i,
            /が際立つ/i,
            // 感情評価語 (過剰使用)
            /\b(?:印象的|魅力的|効果的|興味深い)\b/i,
            // 成長・影響 パターン
            /成長を感じる/i,
            /影を落とす/i,
            /(?:行動|発言)に影響を与えている/i,
            // 緊張感・雰囲気 伝達
            /緊張感が伝わる/i,
            /対比が効果的/i,
            /内面的な葛藤が引き立/i,

            // === 🔥 整理された感情 (文学的表現 — 即死) ===
            /心に(?:響|踊)/i,
            /印象に残る/i,
            /緊張感が(?:生まれ|高まる)/i,
            /を感じさせる/i,
            /(?:孤独感を抱えた|成長した).*が魅力的/i,

            // === 🔥 構造パターン (単語ではなく構造自体) ===
            // "が + 感情動詞" 構造
            /が(?:印象に残った|心に響いた|胸に刺さった|際立っている)/i,
            /がよく(?:描かれている|表れている|表現されている)/i,
            /が(?:感じられる|伝わってくる|見て取れる)/i,
            // "名詞 + が + 抽象名詞 + を + 与える" 構造
            /が(?:深み|影響|印象|変化)を与え/i,
            /の(?:成長|変化|心情)が(?:感じられる|伝わる|見える)/i,

            // === 🔥🔥 名詞+が+評価構文 (最強 AI マーカー) ===
            /描写が迫力を持って/i,
            /冷静さが.*?興奮を増す/i,
            /感情が揺さぶられる/i,
            /表情に思いが込められて/i,
            /対比が(?:面白い|良い)/i,
            /決意が印象的/i,
        ];
        for (const pattern of instantKill) {
            if (pattern.test(comment)) return { score: 0 };
        }

        // === Tier 2: Heavy penalty (-30) ===
        const aiPatterns = [
            /\b(活用|促進|示唆|従って|また|しかし)\b/i,
            /\b(特に|具体的に|本質的に|基本的に)\b/i,
            /。しかしながら、/,
            /この章では/i,
            /作者(?:は|が)/i,
            /見事に|巧みに|鮮やかに/i,
            /\b(描写力|表現力|構成|伏線)\b/i,
            /興味深い(?:展開|設定)/i,
            /\b(示す|表す|描く|描写する|表現する)\b/i,
            // === 🔥 構造パターン (名詞+が+抽象動詞) ===
            /.+が.+(?:感じ|伝わ|際立|増し|高ま|響|刺さ|残)/i,
        ];
        for (const pattern of aiPatterns) {
            if (pattern.test(comment)) score -= 30;
        }

        // === Tier 3: 構造減点 ===
        if (/^[ぁ-んァ-ヶー一-龠].*。$/.test(comment)) score -= 15;
        if (/^(?:この|その|あの)〜(?:は|が)(?:〜|良い|素晴らしい)/i.test(comment)) score -= 15;
        if (/\b(?:物語|ストーリー|キャラクター設定)\b/i.test(comment)) score -= 10;
        if (/。[ぁ-んァ-ヶー一-龠]/.test(comment) && /\b(と|が|けど|でも|から|ので)\b/i.test(comment)) score -= 20;
        if (/。[ぁ-んァ-ヶー一-龠]/.test(comment)) score -= 12;

        // === 🔥 長文減点 (リビュー・トーン = AI  Tell) ===
        if (comment.length > 80) score -= 30;  // 極端に長い
        if (comment.length > 60) score -= 25;  // かなり長い
        if (comment.length > 50 && !/[!?！？…]/.test(comment)) score -= 20;  // 長くて感情マークなし

        // === 🔥 評価終止形減点 (感想文マーカー) ===
        const evalEndings = comment.match(/(?:だった|している|になっている)[。、]/g);
        if (evalEndings && evalEndings.length >= 2) score -= 25;

        // === 🔥 です/ます基本減点 (なろう댓글은 존댓말 비율 낮음) ===
        const desuMasuCount = (comment.match(/(?:です|ます)(?:[。、]|$)/g) || []).length;
        if (desuMasuCount > 0) score -= desuMasuCount * 10;

        // === 🔥 Human Bonus ===
        if (/^[ぁ-ん]/.test(comment)) score += 5; // ひらがな開始
        if (!/[。！？]$/.test(comment)) score += 6; // 句点なし
        if (comment.split('').length <= 10) score += 8; // 超短文
        if (/[A-Z]{2,}/.test(comment)) score += 3; // 大文字連続
        if (/(.)\\1{2,}/.test(comment)) score += 4; // 文字連続
        if (/^[!！?？]+$/.test(comment.trim()) || /[!！?？]{2,}/.test(comment)) score += 3;
        // 日本語スラング
        if (/\b(草|w{2,}|やばい|マジで|それな|エモい|ヤバい)\b/i.test(comment)) score += 4;
        if (/[？?]/.test(comment) && comment.split('').length <= 20) score += 7;
        if (/^(え|ま|あ|お|う|ええ|わ|やば)/i.test(comment)) score += 5;
        if (/\b(よくわからん|どうでもいい|適当|たぶん)\b/i.test(comment)) score += 4;

        return { score: Math.max(0, Math.min(120, score)) };
    },

    // === 集団同調 ===
    extractKeyword: (text) => {
        const words = text.split(/\s+/).filter(w => w.length > 2);
        return words.length > 0 ? words[Math.floor(Math.random() * words.length)] : null;
    },

    herdEchoTemplates: (keyword) => [
        `${keyword}よかった`,
        `${keyword}それな`,
        `${keyword}わかる`,
    ],

    herdCounterTemplates: (keyword) => [
        `${keyword}微妙じゃね`,
        `${keyword}は微妙`,
        `${keyword}どうなん`,
    ],

    highEmotionPattern: /[!！]{2,}|ファ|マジ|ヤバ|きたああ/i,
    emotionBoosters: ['🔥', '💀', '😭', '💔', '🥺', '😤'],

    // === 歪曲 ===
    distortEventText: (summary) => {
        return summary.split('').slice(0, Math.ceil(summary.split('').length * 0.6)).join('') + '…';
    },

    distortInterpretation: (summary, characters) => {
        if (characters.length > 0) {
            return `${characters[0]}って何したっけ？`;
        }
        return `何か起きたけど覚えてない`;
    },

    // === パース ===
    stripLabel: (comment) => {
        return comment.replace(/^\d+[\.)\\-]\s*/, '').replace(/^["']|["']$/g, '').trim();
    },

    minCommentLength: 2,
    maxCommentLength: 100,
    midDensityRange: [10, 40],

    // === 後処理ノイズ ===
    applyPostNoise: (text) => {
        let result = text;

        // 10% 小文字化（カジュアル）
        if (Math.random() < 0.10 && result.length > 0) {
            // 日本語では不要
        }

        return result;
    },

    // === トークナイザー ===
    tokenize: (text) => text.split('').filter(Boolean),

    // === Curator プロンプト (なろう/カクヨム ペルソナ) ===
    curatorPrompt: (commentList, targetCount) => `なろう/カクヨムに何年もいる。コメント欄は流し読み。

ボットが混ざってる。お前の仕事：本物っぽいのを選べ。

分析するな。ルール考えるな。
ただ聞け：「実際の話でこれ見たら『あ、生成っぽ』って思う？」

なろう読者は雑多。賢いのもいる。大半は違う。
流し読みもいる。適当に打って消える奴もいる。
みんな同じ雰囲気なら怪しい。

${targetCount}個、人間が打った感じのを選べ。

${commentList}

JSONだけ:
{ "selected": [インデックス] }`,
};

export default jaLangPack;

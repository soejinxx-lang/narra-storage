/**
 * Comment Bot - 중국산 스타일
 * 
 * Usage: tsx scripts/comment-bot.ts
 */

import { Pool } from 'pg';

const NOVEL_ID = 'novel-1770910615867'; // 테스트 소설 ID
const BOT_COUNT = 30; // 봇 계정 수
const COMMENTS_PER_BOT = 2; // 봇당 댓글 수

// 간단한 댓글 템플릿 (중국산 스타일)
const COMMENT_TEMPLATES = [
    '오 재밌네요',
    '작가님 화이팅!',
    '다음화 기대됩니다',
    '이거 꿀잼이네 ㄹㅇ',
    '전개 미쳤다',
    '아 다음화 언제 나와요??',
    '개띵작 인정',
    '여기까지 읽었습니다',
    '몰입감 ㅁㅊ',
    '작가님 사랑해요',
    '주인공 매력 쩐다',
    '설정 탄탄하네요',
    '다음화 존버',
    'ㅋㅋㅋㅋㅋ 웃겨',
    '소름 돋았어요',
    '복선 깔린 거 같은데',
    '이 전개는 못 참지',
    '벌써 끝이야...?',
    '계속 올려주세요 ㅠㅠ',
    '이거 진짜 재밌음'
];

const USERNAMES = [
    'reader01', 'reader02', 'reader03', 'reader04', 'reader05',
    'reader06', 'reader07', 'reader08', 'reader09', 'reader10',
    'reader11', 'reader12', 'reader13', 'reader14', 'reader15',
    'reader16', 'reader17', 'reader18', 'reader19', 'reader20',
    'reader21', 'reader22', 'reader23', 'reader24', 'reader25',
    'reader26', 'reader27', 'reader28', 'reader29', 'reader30'
];

async function runCommentBot() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway')
            ? { rejectUnauthorized: false }
            : false,
    });

    try {
        console.log('🤖 Starting comment bot...\n');

        // 0. Get Episode ID
        console.log(`🔍 Finding first episode of ${NOVEL_ID}...`);
        const episodeResult = await pool.query(
            `SELECT id FROM episodes WHERE novel_id = $1 ORDER BY episode_number ASC LIMIT 1`,
            [NOVEL_ID]
        );

        if (episodeResult.rows.length === 0) {
            console.error(`❌ No episodes found for ${NOVEL_ID}`);
            return;
        }

        const EPISODE_ID = episodeResult.rows[0].id;
        console.log(`✅ Found episode: ${EPISODE_ID}\n`);

        // 1. 봇 계정 생성 (is_hidden = TRUE)
        console.log(`📝 Creating ${BOT_COUNT} bot accounts...`);
        const botUserIds: string[] = [];

        for (let i = 0; i < BOT_COUNT; i++) {
            const userId = `bot_${Date.now()}_${i}`;
            const username = USERNAMES[i];

            await pool.query(
                `INSERT INTO users (id, username, password_hash, name, is_hidden)
         VALUES ($1, $2, '', $3, TRUE)
         ON CONFLICT (username) DO NOTHING`,
                [userId, username, `봇${i + 1}`]
            );

            botUserIds.push(userId);
            if ((i + 1) % 10 === 0) {
                console.log(`  ✓ ${i + 1}/${BOT_COUNT} bot accounts created`);
            }
        }
        console.log(`✅ ${BOT_COUNT} bot accounts created\n`);

        // 2. 댓글 난사
        console.log(`💬 Posting comments...`);
        let totalComments = 0;

        for (const userId of botUserIds) {
            for (let j = 0; j < COMMENTS_PER_BOT; j++) {
                const randomComment = COMMENT_TEMPLATES[
                    Math.floor(Math.random() * COMMENT_TEMPLATES.length)
                ];

                await pool.query(
                    `INSERT INTO comments (id, episode_id, user_id, content, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
                    [
                        `comment_${Date.now()}_${totalComments}`,
                        EPISODE_ID,
                        userId,
                        randomComment
                    ]
                );

                totalComments++;
                if (totalComments % 10 === 0) {
                    console.log(`  ✓ ${totalComments} comments posted`);
                }

                // 약간의 딜레이 (자연스럽게)
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`\n✅ Total ${totalComments} comments posted!`);
        console.log('\n📊 Summary:');
        console.log(`  - Bot accounts: ${BOT_COUNT}`);
        console.log(`  - Comments per bot: ${COMMENTS_PER_BOT}`);
        console.log(`  - Total comments: ${totalComments}`);
        console.log(`  - Episode ID: ${EPISODE_ID}`);
        console.log(`\n👁️ These comments are only visible to admin (서진) account!`);

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

runCommentBot();

import { NextResponse, NextRequest } from "next/server";
import db from "../../../db";
import { requireAdmin } from "../../../../lib/admin";

/**
 * 댓글봇 실행 API
 * GET /api/dev/run-comment-bot?novel=novel-xxx&count=60
 * 
 * 봇 계정 생성 + 댓글 난사 (is_hidden = TRUE)
 */

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

export async function GET(req: NextRequest) {
    // 🔒 Admin API Key 체크
    const unauthorized = requireAdmin(req);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(req.url);
    const novelId = searchParams.get('novel');
    const count = parseInt(searchParams.get('count') || '60');

    if (!novelId) {
        return NextResponse.json(
            { error: 'novel parameter required' },
            { status: 400 }
        );
    }

    try {
        console.log(`🤖 Starting comment bot for ${novelId}...`);

        // 1. 에피소드 ID 조회
        const episodeResult = await db.query(
            `SELECT id FROM episodes WHERE novel_id = $1 ORDER BY ep ASC LIMIT 1`,
            [novelId]
        );

        if (episodeResult.rows.length === 0) {
            return NextResponse.json(
                { error: `No episodes found for ${novelId}` },
                { status: 404 }
            );
        }

        const episodeId = episodeResult.rows[0].id;
        console.log(`✅ Target episode: ${episodeId}`);

        // 2. 봇 계정 생성
        const botCount = Math.ceil(count / 2); // 봇당 2개 댓글
        const botUserIds: string[] = [];

        for (let i = 0; i < botCount; i++) {
            const userId = `bot_${Date.now()}_${i}`;
            const username = `reader${String(i + 1).padStart(2, '0')}`;

            await db.query(
                `INSERT INTO users (id, username, password_hash, name, is_hidden)
         VALUES ($1, $2, '', $3, TRUE)
         ON CONFLICT (username) DO UPDATE SET id = EXCLUDED.id
         RETURNING id`,
                [userId, username, `봇${i + 1}`]
            );

            botUserIds.push(userId);
        }

        console.log(`✅ Created ${botCount} bot accounts`);

        // 3. 댓글 생성
        let commentsPosted = 0;

        for (const userId of botUserIds) {
            const commentsPerBot = Math.min(2, count - commentsPosted);

            for (let j = 0; j < commentsPerBot; j++) {
                const randomComment = COMMENT_TEMPLATES[
                    Math.floor(Math.random() * COMMENT_TEMPLATES.length)
                ];

                await db.query(
                    `INSERT INTO comments (id, episode_id, user_id, content, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
                    [`comment_${Date.now()}_${commentsPosted}`, episodeId, userId, randomComment]
                );

                commentsPosted++;

                if (commentsPosted >= count) break;
            }

            if (commentsPosted >= count) break;

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log(`✅ Posted ${commentsPosted} comments`);

        return NextResponse.json({
            success: true,
            novel: novelId,
            episode: episodeId,
            botAccounts: botCount,
            commentsPosted: commentsPosted
        });

    } catch (error) {
        console.error('Comment Bot Error:', error);
        return NextResponse.json(
            { error: 'Failed to run comment bot' },
            { status: 500 }
        );
    }
}

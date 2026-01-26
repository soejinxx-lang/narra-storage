import { NextResponse } from "next/server";
import db from "../../../../db";

// 간단한 토큰 검증 (Bearer Token -> User ID)
async function getUserIdFromToken(authHeader: string | null): Promise<string | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.split(" ")[1];

    // user_sessions 테이블 조회
    const res = await db.query(
        `SELECT user_id FROM user_sessions 
     WHERE token = $1 AND expires_at > NOW()`,
        [token]
    );

    if (res.rows.length > 0) {
        return res.rows[0].user_id;
    }

    return null;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // 댓글 목록 조회 (유저 정보 포함, 오래된 순)
        // Parent ID가 있는 대댓글은 프론트에서 재구성하거나 여기서 정렬할 수 있음.
        // 여기선 일단 시간순으로 다 내려줌.
        const result = await db.query(
            `SELECT 
         c.id, c.content, c.likes, c.created_at, c.parent_id,
         u.username, u.name
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.episode_id = $1 AND c.is_hidden = FALSE
       ORDER BY c.created_at ASC`,
            [id]
        );

        return NextResponse.json({ comments: result.rows });
    } catch (error) {
        console.error("Get Comments Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // 1. 인증 체크
        const userId = await getUserIdFromToken(request.headers.get("Authorization"));
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Body 파싱
        const body = await request.json();
        const { content, parent_id } = body;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return NextResponse.json({ error: "Content is required" }, { status: 400 });
        }

        // 3. 저장
        const result = await db.query(
            `INSERT INTO comments (episode_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content, created_at, likes, parent_id`,
            [id, userId, content, parent_id || null]
        );

        // 유저 정보도 같이 리턴해주면 프론트가 편함
        const userRes = await db.query(`SELECT username, name FROM users WHERE id = $1`, [userId]);
        const user = userRes.rows[0];

        const newComment = {
            ...result.rows[0],
            username: user.username,
            name: user.name
        };

        return NextResponse.json({ success: true, comment: newComment });

    } catch (error) {
        console.error("Post Comment Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

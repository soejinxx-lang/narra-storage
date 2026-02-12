import { NextResponse } from "next/server";
import db from "../../../../db";
import { getUserIdFromToken, isAdmin } from "../../../../../lib/auth";


export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // ----------------------------------------------------------------
    // GET: 댓글 목록
    // ----------------------------------------------------------------
    try {
        // Check if user is admin
        const userIsAdmin = await isAdmin(request.headers.get("Authorization"));

        // Filter hidden user comments for non-admin
        const userWhereClause = userIsAdmin ? "" : "AND (u.is_hidden = FALSE OR u.is_hidden IS NULL)";

        const result = await db.query(
            `SELECT 
         c.id, c.content, c.likes, c.created_at, c.parent_id,
         COALESCE(u.username, 'Guest') as username, 
         COALESCE(u.name, 'Guest') as name
       FROM comments c
       LEFT JOIN users u ON c.user_id::text = u.id
       WHERE c.episode_id = $1 AND c.is_hidden = FALSE ${userWhereClause}
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
        // 1. 인증 체크 (Optional)
        // 토큰이 있으면 유저 ID 가져오고, 없으면 null (Guest)
        const userId = await getUserIdFromToken(request.headers.get("Authorization"));

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

        let userInfo = { username: "Guest", name: "Guest" };

        // 4. 유저 정보 조회 (로그인했으면)
        if (userId) {
            const userRes = await db.query(`SELECT username, name FROM users WHERE id = $1`, [userId]);
            if (userRes.rows.length > 0) {
                userInfo = userRes.rows[0];
            }
        }

        const newComment = {
            ...result.rows[0],
            username: userInfo.username,
            name: userInfo.name
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

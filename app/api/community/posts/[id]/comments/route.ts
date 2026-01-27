import { NextResponse } from "next/server";
import db from "../../../../../db";

async function getUserIdFromToken(authHeader: string | null): Promise<string | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split(" ")[1];
    const res = await db.query(
        `SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()`,
        [token]
    );
    return res.rows.length > 0 ? res.rows[0].user_id : null;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // post id
) {
    const { id } = await params;

    try {
        const result = await db.query(
            `SELECT 
                c.id, c.content, c.created_at, c.parent_id, c.user_id,
                COALESCE(u.username, 'Unknown') as author, 
                COALESCE(u.name, 'Unknown') as author_name
             FROM community_comments c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.post_id = $1
             ORDER BY c.created_at ASC`,
            [id]
        );

        // Frontend expects nested structure (replies array)
        // Similar to the other comment section logic
        const rawComments = result.rows;
        const commentMap: any = {};
        const rootComments: any[] = [];

        rawComments.forEach(c => {
            c.replies = [];
            // Map author/author_name to frontend expected format if needed
            // Frontend 'Comment' interface: author: string.
            // We set author to username. 
            commentMap[c.id] = c;
        });

        rawComments.forEach(c => {
            if (c.parent_id && commentMap[c.parent_id]) {
                commentMap[c.parent_id].replies.push(c);
            } else {
                rootComments.push(c);
            }
        });

        return NextResponse.json({ comments: rootComments });

    } catch (error) {
        console.error("Get Community Comments Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const userId = await getUserIdFromToken(request.headers.get("Authorization"));

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { content, parent_id } = body;

        if (!content) {
            return NextResponse.json({ error: "Content is required" }, { status: 400 });
        }

        const result = await db.query(
            `INSERT INTO community_comments (post_id, user_id, content, parent_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, content, created_at, parent_id`,
            [id, userId, content, parent_id || null]
        );

        const authorRes = await db.query(`SELECT username, name FROM users WHERE id = $1`, [userId]);
        const author = authorRes.rows[0];

        const newComment = {
            ...result.rows[0],
            author: author.username,
            author_name: author.name,
            replies: []
        };

        return NextResponse.json({ success: true, comment: newComment });

    } catch (error) {
        console.error("Create Community Comment Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

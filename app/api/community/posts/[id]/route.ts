import { NextResponse } from "next/server";
import db from "../../../../db";

import { getUserIdFromToken } from "../../../../../lib/auth";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const userId = await getUserIdFromToken(request.headers.get("Authorization"));

    try {
        await db.query(`UPDATE community_posts SET views = views + 1 WHERE id = $1`, [id]);

        // Simplified Query: No joins for likes table
        const query = `
            SELECT 
                p.id, p.title, p.content, p.topic, p.views, p.likes, p.created_at, p.user_id,
                COALESCE(u.username, 'Unknown') as author, 
                COALESCE(u.name, 'Unknown') as author_name,
                (SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id)::int as comment_count,
                 (EXISTS(SELECT 1 FROM community_post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $2)) as liked_by_me
            FROM community_posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `;

        const result = await db.query(query, [id, userId]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        return NextResponse.json({ post: result.rows[0] });

    } catch (error) {
        console.error("Get Post Detail Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const currentUserId = await getUserIdFromToken(request.headers.get("Authorization"));

    if (!currentUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const postRes = await db.query(`SELECT user_id FROM community_posts WHERE id = $1`, [id]);
        if (postRes.rows.length === 0) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        const post = postRes.rows[0];
        if (currentUserId !== 'ADMIN' && post.user_id !== currentUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await db.query(`DELETE FROM community_posts WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Delete Post Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

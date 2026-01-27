import { NextResponse } from "next/server";
import db from "../../../db";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const topic = searchParams.get("topic");

        // Simplified Query: likes is just a column
        let query = `
            SELECT 
                p.id, p.title, p.content, p.topic, p.views, p.created_at, p.likes,
                COALESCE(u.username, 'Unknown') as author, 
                COALESCE(u.name, 'Unknown') as author_name,
                (SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id)::int as comment_count
            FROM community_posts p
            LEFT JOIN users u ON p.user_id = u.id
        `;

        const params: any[] = [];

        if (topic && topic !== "general") {
            query += ` WHERE p.topic = $${params.length + 1}`;
            params.push(topic);
        }

        query += ` ORDER BY p.created_at DESC LIMIT 50`;

        const result = await db.query(query, params);

        return NextResponse.json({ posts: result.rows });

    } catch (error) {
        console.error("Get Posts Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    // ... kept same logic for creation
    // But need to import getUserIdFromToken
    const getUserIdFromToken = async (authHeader: string | null) => {
        if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
        const token = authHeader.split(" ")[1];
        const res = await db.query(`SELECT user_id FROM user_sessions WHERE token = $1`, [token]);
        return res.rows[0]?.user_id;
    }

    try {
        const userId = await getUserIdFromToken(request.headers.get("Authorization"));
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const { title, content, topic } = body;

        if (!title || !content) {
            return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
        }

        const result = await db.query(
            `INSERT INTO community_posts (user_id, title, content, topic, likes)
             VALUES ($1, $2, $3, $4, 0)
             RETURNING id, title, content, topic, created_at, views, likes`,
            [userId, title, content, topic || 'general']
        );

        const authorRes = await db.query(`SELECT username, name FROM users WHERE id = $1`, [userId]);
        const author = authorRes.rows[0];

        const newPost = {
            ...result.rows[0],
            author: author.username,
            author_name: author.name,
            comment_count: 0
        };

        return NextResponse.json({ success: true, post: newPost });

    } catch (error) {
        console.error("Create Post Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

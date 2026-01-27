import { NextResponse } from "next/server";
import db from "../../../../../db";
import { getUserIdFromToken } from "../../../../../../lib/auth";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const userId = await getUserIdFromToken(request.headers.get("Authorization"));
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Transaction
        const client = await db.connect();
        try {
            await client.query("BEGIN");

            // Check if already liked
            const checkRes = await client.query(
                `SELECT 1 FROM community_post_likes WHERE post_id = $1 AND user_id = $2`,
                [id, userId]
            );

            let newLikes = 0;
            let liked = false;

            if (checkRes.rows.length > 0) {
                // Unlike
                await client.query(
                    `DELETE FROM community_post_likes WHERE post_id = $1 AND user_id = $2`,
                    [id, userId]
                );
                const updateRes = await client.query(
                    `UPDATE community_posts SET likes = GREATEST(0, likes - 1) WHERE id = $1 RETURNING likes`,
                    [id]
                );
                newLikes = updateRes.rows[0]?.likes || 0;
                liked = false;
            } else {
                // Like
                await client.query(
                    `INSERT INTO community_post_likes (post_id, user_id) VALUES ($1, $2)`,
                    [id, userId]
                );
                const updateRes = await client.query(
                    `UPDATE community_posts SET likes = likes + 1 WHERE id = $1 RETURNING likes`,
                    [id]
                );
                newLikes = updateRes.rows[0]?.likes || 0;
                liked = true;
            }

            await client.query("COMMIT");
            return NextResponse.json({ success: true, likes: newLikes, liked });

        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Like Toggle Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import db from "../../../../../db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { increment } = body; // true (+1) or false (-1)

        // Simple Counter Update
        const delta = increment ? 1 : -1;

        // Prevent negative likes
        const updateQuery = `
            UPDATE community_posts 
            SET likes = GREATEST(0, likes + $1) 
            WHERE id = $2 
            RETURNING likes
        `;

        const result = await db.query(updateQuery, [delta, id]);

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, likes: result.rows[0].likes });

    } catch (error) {
        console.error("Like Toggle Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

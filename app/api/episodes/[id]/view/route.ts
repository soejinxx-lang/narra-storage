import { NextResponse } from "next/server";
import db from "../../../../db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    console.log(`[VIEW API] Received request for episode: ${id}`);

    try {
        // 단순하게 조회수 +1
        console.log(`[VIEW API] Incrementing views for episode: ${id}`);
        await db.query(
            `UPDATE episodes SET views = views + 1 WHERE id = $1`,
            [id]
        );

        // 현재 조회수 조회
        const result = await db.query(
            `SELECT views FROM episodes WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            console.error(`[VIEW API] Episode not found: ${id}`);
            return NextResponse.json({ error: "Episode not found" }, { status: 404 });
        }

        const views = parseInt(result.rows[0].views || "0");
        console.log(`[VIEW API] Success! Episode ${id} now has ${views} views`);

        return NextResponse.json({
            success: true,
            views
        });

    } catch (error) {
        console.error("[VIEW API] Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

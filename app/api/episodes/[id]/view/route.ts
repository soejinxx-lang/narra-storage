import { NextResponse } from "next/server";
import db from "../../../../db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // 단순하게 조회수 +1
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
            return NextResponse.json({ error: "Episode not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            views: parseInt(result.rows[0].views || "0")
        });

    } catch (error) {
        console.error("View Count Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

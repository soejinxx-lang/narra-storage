import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../../db";

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    await initDb();

    const { id } = await context.params;

    // 작가 정보
    const authorResult = await db.query(
        "SELECT id, username, name, bio, avatar_url, created_at FROM users WHERE id = $1",
        [id]
    );

    if (authorResult.rowCount === 0) {
        return NextResponse.json({ error: "AUTHOR_NOT_FOUND" }, { status: 404 });
    }

    // 해당 작가의 소설 목록
    const novelsResult = await db.query(
        "SELECT * FROM novels WHERE author_id = $1 ORDER BY id ASC",
        [id]
    );

    return NextResponse.json({
        author: authorResult.rows[0],
        novels: novelsResult.rows,
    });
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    await initDb();

    const { id } = await context.params;
    const body = await req.json();

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (body.bio !== undefined) {
        updates.push(`bio = $${paramIndex++}`);
        values.push(body.bio);
    }

    if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(body.name);
    }

    if (updates.length === 0) {
        return NextResponse.json({ error: "NO_FIELDS_TO_UPDATE" }, { status: 400 });
    }

    values.push(id);

    const result = await db.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING id, username, name, bio, avatar_url`,
        values
    );

    if (result.rowCount === 0) {
        return NextResponse.json({ error: "AUTHOR_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ author: result.rows[0] });
}

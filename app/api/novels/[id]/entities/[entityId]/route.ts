import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../../db";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; entityId: string }> }
) {
  await initDb();

  const { id: novelId, entityId } = await context.params;

  console.log("=== Storage DELETE Entity ===");
  console.log("Novel ID:", novelId);
  console.log("Entity ID:", entityId);

  try {
    const result = await db.query(
      `DELETE FROM entities
       WHERE id = $1 AND novel_id = $2`,
      [entityId, novelId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "ENTITY_NOT_FOUND" },
        { status: 404 }
      );
    }

    console.log("DELETE success, rowCount:", result.rowCount);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE ENTITY ERROR:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", detail: error.message },
      { status: 500 }
    );
  }
}

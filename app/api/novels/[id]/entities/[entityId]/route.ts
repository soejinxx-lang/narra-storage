import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "../../../../../db";
import { requireOwnerOrAdmin } from "../../../../../../lib/requireAuth";
import fs from "fs";
import path from "path";

const PIPELINE_ENTITIES_DIR =
  process.env.PIPELINE_ENTITIES_DIR || "/app/data/entities";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; entityId: string }> }
) {
  const { id: novelId, entityId } = await context.params;

  // 🔒 소유자 OR Admin 확인
  await initDb();

  const authResult = await requireOwnerOrAdmin(req, novelId);
  if (authResult instanceof NextResponse) return authResult;

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

    // 🔄 DB → Pipeline entities 파일 재동기화
    const allEntitiesRes = await db.query(
      `SELECT source_text, translations, locked, category, notes
       FROM entities WHERE novel_id = $1`,
      [novelId]
    );

    const entityMap: Record<string, unknown> = {};
    for (const e of allEntitiesRes.rows) {
      entityMap[e.source_text] = {
        translations: e.translations,
        locked: e.locked,
        category: e.category,
        notes: e.notes,
      };
    }

    fs.mkdirSync(PIPELINE_ENTITIES_DIR, { recursive: true });
    const filePath = path.join(PIPELINE_ENTITIES_DIR, `${novelId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entityMap, null, 2), "utf-8");

    console.log(`[entity-delete] Synced pipeline file for novel ${novelId}`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("DELETE ENTITY ERROR:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", detail: message },
      { status: 500 }
    );
  }
}

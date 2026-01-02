import { NextResponse } from "next/server";
import db, { initDb } from "../../../../db";

export async function GET(req: Request) {
  await initDb();

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("Authorization");

  // 🔒 Cron 보호 (CRON_SECRET 없거나 불일치면 차단)
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pipelineUrl = process.env.PIPELINE_BASE_URL;
  const pipelinePin = process.env.PIPELINE_ACCESS_PIN;

  if (!pipelineUrl || !pipelinePin) {
    return NextResponse.json(
      { error: "PIPELINE_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  // 🧹 오래된 RUNNING 정리 (15분 이상)
  await db.query(`
    UPDATE episode_translations
    SET
      status = 'FAILED',
      error_message = 'STALE_RUNNING',
      updated_at = NOW()
    WHERE status = 'RUNNING'
      AND updated_at < NOW() - INTERVAL '15 minutes'
  `);

  const pendingRes = await db.query(
    `
    SELECT
      t.id AS translation_id,
      t.episode_id,
      t.language,
      e.content,
      n.id AS novel_id
    FROM episode_translations t
    JOIN episodes e ON e.id = t.episode_id
    JOIN novels n ON n.id = e.novel_id
    WHERE t.status = 'PENDING'
    ORDER BY t.created_at ASC
    LIMIT 5
    FOR UPDATE SKIP LOCKED
    `
  );

  for (const row of pendingRes.rows) {
    const {
      translation_id,
      language,
      content,
      novel_id,
    } = row;

    try {
      // 🔐 PENDING → RUNNING 원자적 전환
      const lockRes = await db.query(
        `
        UPDATE episode_translations
        SET status = 'RUNNING', updated_at = NOW()
        WHERE id = $1 AND status = 'PENDING'
        RETURNING id
        `,
        [translation_id]
      );

      if (lockRes.rowCount === 0) {
        continue;
      }

      const res = await fetch(`${pipelineUrl}/translate_episode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Pin": pipelinePin,
        },
        body: JSON.stringify({
          novel_title: novel_id,
          text: content,
          language,
        }),
      });

      if (!res.ok) {
        throw new Error(`PIPELINE_ERROR_${res.status}`);
      }

      const data = await res.json();
      const translatedText = data?.translated_text;

      if (!translatedText) {
        throw new Error("NO_TRANSLATED_TEXT");
      }

      await db.query(
        `
        UPDATE episode_translations
        SET
          translated_text = $1,
          status = 'DONE',
          updated_at = NOW()
        WHERE id = $2
        `,
        [translatedText, translation_id]
      );
    } catch (e: any) {
      await db.query(
        `
        UPDATE episode_translations
        SET
          status = 'FAILED',
          error_message = $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [String(e?.message || e), translation_id]
      );
    }
  }

  return NextResponse.json({
    processed: pendingRes.rowCount,
  });
}

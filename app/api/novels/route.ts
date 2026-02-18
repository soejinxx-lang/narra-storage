import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../db";
import { isAdmin, getUserIdFromToken } from "../../../lib/auth";
import { requireAuth, consumeNovelQuota } from "../../../lib/requireAuth";

export async function GET(req: NextRequest) {
  await initDb();

  const userIsAdmin = await isAdmin(req.headers.get("Authorization"));

  let result;
  if (userIsAdmin) {
    result = await db.query(
      `SELECT id, title, description, cover_url, source_language, author_id, genre, is_original, serial_status, episode_format, is_hidden, source FROM novels`
    );
  } else {
    result = await db.query(
      `SELECT n.id, n.title, n.description, n.cover_url, n.source_language, n.author_id, n.genre, n.is_original, n.serial_status, n.episode_format, n.is_hidden
       FROM novels n
       LEFT JOIN users u ON n.author_id = u.id
       WHERE n.is_hidden = FALSE
         AND (u.is_hidden = FALSE OR u.is_hidden IS NULL)`
    );
  }
  return NextResponse.json({ novels: result.rows });
}

export async function POST(req: NextRequest) {
  await initDb();

  const authHeader = req.headers.get("Authorization");
  const isAdminUser = await isAdmin(authHeader);

  // Admin API Key → 기존 방식 그대로 (제한 없음, source='official')
  if (isAdminUser) {
    const body = await req.json();
    if (!body?.title) {
      return NextResponse.json({ error: "INVALID_NOVEL_DATA" }, { status: 400 });
    }
    const id = body.id ?? `novel-${Date.now()}`;
    const sourceLanguage = body.source_language ?? "ko";
    const authorId = await getUserIdFromToken(authHeader);
    if (!authorId) {
      return NextResponse.json({ error: "AUTHOR_ID_REQUIRED" }, { status: 401 });
    }
    const exists = await db.query("SELECT 1 FROM novels WHERE id = $1", [id]);
    if (exists.rowCount && exists.rowCount > 0) {
      return NextResponse.json({ error: "NOVEL_ALREADY_EXISTS" }, { status: 409 });
    }
    await db.query(
      "INSERT INTO novels (id, title, description, cover_url, source_language, author_id, source) VALUES ($1, $2, $3, $4, $5, $6, 'official')",
      [id, body.title, body.description ?? "", null, sourceLanguage, authorId]
    );
    return NextResponse.json(
      {
        novel: {
          id,
          title: body.title,
          description: body.description ?? "",
          cover_url: null,
          source_language: sourceLanguage,
          author_id: authorId,
          source: "official",
        },
      },
      { status: 201 }
    );
  }

  // 퍼블릭 작가 → requireAuth
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  // 가입 후 10분 쿨다운 (created_at 기준, DB 서버 시간)
  const userRow = await db.query(
    `SELECT created_at FROM users WHERE id = $1`,
    [userId]
  );
  if (userRow.rows.length > 0) {
    const createdAt = new Date(userRow.rows[0].created_at);
    const minutesSinceSignup = (Date.now() - createdAt.getTime()) / 60000;
    if (minutesSinceSignup < 10) {
      const waitSeconds = Math.ceil((10 - minutesSinceSignup) * 60);
      return NextResponse.json(
        {
          error: "SIGNUP_COOLDOWN",
          message: "가입 후 10분 후에 소설을 만들 수 있습니다.",
          waitSeconds,
        },
        { status: 429 }
      );
    }
  }

  // 하루 소설 생성 쿼터 (3개/일)
  const quotaResult = await consumeNovelQuota(userId);
  if (quotaResult !== true) {
    return NextResponse.json(
      {
        error: "NOVEL_QUOTA_EXCEEDED",
        message: "오늘 소설 생성 횟수를 모두 사용했습니다.",
        resetIn: quotaResult.resetIn,
      },
      { status: 429 }
    );
  }

  const body = await req.json();
  if (!body?.title) {
    return NextResponse.json({ error: "INVALID_NOVEL_DATA" }, { status: 400 });
  }

  const id = `novel-${Date.now()}`;
  const sourceLanguage = body.source_language ?? "ko";

  const exists = await db.query("SELECT 1 FROM novels WHERE id = $1", [id]);
  if (exists.rowCount && exists.rowCount > 0) {
    return NextResponse.json({ error: "NOVEL_ALREADY_EXISTS" }, { status: 409 });
  }

  // 트랜잭션: 소설 생성 + role='author' 승격 원자적 처리
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "INSERT INTO novels (id, title, description, cover_url, source_language, author_id, source) VALUES ($1, $2, $3, $4, $5, $6, 'user')",
      [id, body.title, body.description ?? "", null, sourceLanguage, userId]
    );

    // 첫 소설 생성 시 reader → author 자동 승격
    await client.query(
      `UPDATE users SET role = 'author' WHERE id = $1 AND role = 'reader'`,
      [userId]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return NextResponse.json(
    {
      novel: {
        id,
        title: body.title,
        description: body.description ?? "",
        cover_url: null,
        source_language: sourceLanguage,
        author_id: userId,
        source: "user",
      },
    },
    { status: 201 }
  );
}

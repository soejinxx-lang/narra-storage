import { NextResponse, NextRequest } from "next/server";
import db, { initDb } from "../../db";
import { isAdmin } from "../../../lib/auth";

export async function GET(req: NextRequest) {
  await initDb();

  // Check if user is admin
  const userIsAdmin = await isAdmin(req.headers.get("Authorization"));

  // Filter hidden authors for non-admin users
  const userWhereClause = userIsAdmin ? "" : "WHERE u.is_hidden = FALSE";
  const novelWhereClause = userIsAdmin ? "" : "AND n.is_hidden = FALSE";

  const result = await db.query(`
    SELECT u.id, u.username, u.name, u.bio, u.avatar_url, u.created_at, u.is_hidden,
           COUNT(n.id) as novel_count
    FROM users u
    LEFT JOIN novels n ON n.author_id = u.id ${novelWhereClause}
    ${userWhereClause}
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `);

  return NextResponse.json({ authors: result.rows });
}

import { NextResponse } from "next/server";
import db from "../../../db";

/**
 * DB 스키마 검증 API
 * GET /api/dev/check-schema
 * 
 * users 테이블 스키마 및 bot 데이터 확인
 */
export async function GET() {
    try {
        // 1. users.id 타입 확인
        const schemaResult = await db.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);

        // 2. 실제 봇 유저 샘플 확인
        const botUsersResult = await db.query(`
      SELECT id, username, pg_typeof(id) as id_type, is_hidden
      FROM users
      WHERE username LIKE 'bot_%' OR username LIKE 'reader%'
      ORDER BY username
      LIMIT 10;
    `);

        // 3. comments 스키마 확인
        const commentsSchemaResult = await db.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'comments'
      AND column_name IN ('id', 'user_id')
      ORDER BY ordinal_position;
    `);

        // 4. 전체 봇 유저 카운트
        const botCountResult = await db.query(`
      SELECT 
        COUNT(*) as total_bots,
        COUNT(CASE WHEN username LIKE 'bot_%' THEN 1 END) as bot_prefix,
        COUNT(CASE WHEN username LIKE 'reader%' THEN 1 END) as reader_prefix
      FROM users
      WHERE is_hidden = TRUE;
    `);

        return NextResponse.json({
            success: true,
            usersSchema: schemaResult.rows,
            botUsers: botUsersResult.rows,
            commentsSchema: commentsSchemaResult.rows,
            botCounts: botCountResult.rows[0],
            diagnosis: {
                usersIdType: schemaResult.rows.find(r => r.column_name === 'id')?.data_type,
                commentsUserIdType: commentsSchemaResult.rows.find(r => r.column_name === 'user_id')?.data_type,
                hasOldBots: botUsersResult.rows.some(r => r.id_type !== 'uuid')
            }
        });

    } catch (error) {
        console.error('Schema Check Error:', error);
        return NextResponse.json(
            { error: 'Failed to check schema', details: String(error) },
            { status: 500 }
        );
    }
}

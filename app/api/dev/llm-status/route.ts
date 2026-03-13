import { NextResponse } from "next/server";
import db from "../../../../db";

/**
 * LLM Provider 상태 조회 API
 * GET /api/dev/llm-status
 * 
 * 최근 LLM 호출 통계 반환 (Grok vs Azure)
 */
export async function GET() {
    try {
        // 테이블 없으면 생성
        await db.query(`
            CREATE TABLE IF NOT EXISTS llm_call_log (
                id SERIAL PRIMARY KEY,
                provider TEXT NOT NULL,
                engine TEXT NOT NULL,
                success BOOLEAN NOT NULL DEFAULT true,
                latency_ms INTEGER,
                fallback_used BOOLEAN NOT NULL DEFAULT false,
                error_msg TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // 최근 1시간 통계
        const stats = await db.query(`
            SELECT 
                provider,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE success) as success_count,
                COUNT(*) FILTER (WHERE NOT success) as fail_count,
                COUNT(*) FILTER (WHERE fallback_used) as fallback_count,
                ROUND(AVG(latency_ms)) as avg_latency_ms,
                MAX(created_at) as last_call_at
            FROM llm_call_log
            WHERE created_at > NOW() - INTERVAL '1 hour'
            GROUP BY provider
            ORDER BY provider
        `);

        // 최근 20개 호출 상세
        const recent = await db.query(`
            SELECT provider, engine, success, fallback_used, latency_ms, error_msg, created_at
            FROM llm_call_log
            ORDER BY created_at DESC
            LIMIT 20
        `);

        // 전체 누적 (24시간)
        const daily = await db.query(`
            SELECT 
                provider,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE success) as success_count,
                COUNT(*) FILTER (WHERE fallback_used) as fallback_count
            FROM llm_call_log
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY provider
        `);

        return NextResponse.json({
            hourly: stats.rows,
            daily: daily.rows,
            recent: recent.rows,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('LLM Status Error:', error);
        return NextResponse.json(
            { error: 'Failed to get LLM status', details: String(error) },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import db, { initDb } from "@/db";

// POST: Playwright 리포터에서 결과 전송
export async function POST(req: NextRequest) {
    try {
        await initDb();

        // Admin API Key 검증 (선택적 — 설정되어 있으면 검증, 없으면 통과)
        const apiKey = req.headers.get("x-admin-key");
        const validKey = process.env.ADMIN_API_KEY;

        // 🔍 디버그 로그
        console.log("[test-results POST] 요청 수신");
        console.log(`  X-Admin-Key: ${apiKey ? `있음 (${apiKey.length}자)` : "없음"}`);
        console.log(`  ADMIN_API_KEY 설정: ${validKey ? "있음" : "없음"}`);

        if (validKey && apiKey !== validKey) {
            console.warn("[test-results POST] 401 Unauthorized — 키 불일치");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const {
            total, passed, failed, skipped = 0,
            duration, environment = "local",
            commit_hash = null, branch = null,
            tests = [],
        } = body;

        console.log(`  payload: total=${total}, passed=${passed}, failed=${failed}, tests.length=${tests.length}, env=${environment}`);

        if (!total && total !== 0) {
            console.warn("[test-results POST] 400 — total 필드 없음");
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // test_runs INSERT
        const runResult = await db.query(
            `INSERT INTO test_runs (total, passed, failed, skipped, duration, environment, commit_hash, branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
            [total, passed, failed, skipped, duration, environment, commit_hash, branch]
        );

        const runId = runResult.rows[0].id;
        console.log(`[test-results POST] run_id=${runId} 생성됨`);

        // test_results INSERT (batch)
        for (const test of tests) {
            await db.query(
                `INSERT INTO test_results (run_id, test_path, suite, name, status, duration, error_message, error_stack)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    runId,
                    test.test_path || `${test.suite}/${test.name}`,
                    test.suite || "unknown",
                    test.name,
                    test.status,
                    test.duration || null,
                    test.error_message || null,
                    test.error_stack || null,
                ]
            );
        }

        console.log(`[test-results POST] 완료 — ${tests.length}개 결과 저장`);
        return NextResponse.json({ success: true, run_id: runId });
    } catch (error) {
        console.error("Test results POST error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// GET: 테스트 히스토리 조회
export async function GET(req: NextRequest) {
    try {
        await initDb();

        const { searchParams } = new URL(req.url);
        const runId = searchParams.get("id");
        const latest = searchParams.get("latest");
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

        // 특정 run 상세 조회
        if (runId) {
            const run = await db.query(
                `SELECT * FROM test_runs WHERE id = $1`, [runId]
            );

            if (run.rows.length === 0) {
                return NextResponse.json({ error: "Run not found" }, { status: 404 });
            }

            const results = await db.query(
                `SELECT * FROM test_results WHERE run_id = $1 ORDER BY status DESC, duration DESC`,
                [runId]
            );

            return NextResponse.json({
                run: run.rows[0],
                tests: results.rows,
            });
        }

        // 최신 1건
        if (latest !== null) {
            const run = await db.query(
                `SELECT * FROM test_runs ORDER BY timestamp DESC LIMIT 1`
            );

            if (run.rows.length === 0) {
                return NextResponse.json({ run: null, tests: [] });
            }

            const results = await db.query(
                `SELECT * FROM test_results WHERE run_id = $1 ORDER BY status DESC, duration DESC`,
                [run.rows[0].id]
            );

            return NextResponse.json({
                run: run.rows[0],
                tests: results.rows,
            });
        }

        // 히스토리 목록
        const runs = await db.query(
            `SELECT * FROM test_runs ORDER BY timestamp DESC LIMIT $1`,
            [limit]
        );

        return NextResponse.json({ runs: runs.rows });
    } catch (error) {
        console.error("Test results GET error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

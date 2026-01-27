import { NextResponse } from "next/server";
import db from "../../../../db";

// 1명부터 100명까지 순차적 확률 분포
function getTieredGhostCount(): number {
    const roll = Math.random() * 100;

    if (roll < 50) return Math.floor(Math.random() * 10) + 1;    // 0~50% : 1~10명 (일상)
    if (roll < 80) return Math.floor(Math.random() * 20) + 11;   // 51~80% : 11~30명 (관심)
    if (roll < 95) return Math.floor(Math.random() * 40) + 31;   // 81~95% : 31~70명 (화제)
    if (roll < 99) return Math.floor(Math.random() * 20) + 71;   // 96~99% : 71~90명 (인기)
    return Math.floor(Math.random() * 10) + 91;                  // 99~100%: 91~100명 (대박)
}

// 다음 유령 도착 시간 간격 (5분 ~ 30분 랜덤)
function getNextIntervalMs(): number {
    const minutes = Math.floor(Math.random() * 26) + 5; // 5 ~ 30
    return minutes * 60 * 1000;
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // 1. 현재 상태 조회
        // next_jackpot_at 컬럼을 "다음 유령 도착 예정 시간"으로 재활용합니다.
        const result = await db.query(
            `SELECT views, ghost_pool, next_jackpot_at FROM episodes WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Episode not found" }, { status: 404 });
        }

        const row = result.rows[0];
        const currentViews = parseInt(row.views || "0");
        let ghostPool = parseInt(row.ghost_pool || "0");
        let nextArrivalAt = row.next_jackpot_at ? new Date(row.next_jackpot_at) : null;
        const now = new Date();

        // 2. 시간 경과에 따른 유령 도착 처리 (Catch-up Loop)
        // 마지막으로 예약된 시간보다 현재 시간이 더 지났다면, 그 사이 도착했어야 할 유령들을 정산합니다.
        let ghostsArrived = 0;

        // 예약된 시간이 있고, 그 시간이 지났으며, 대기 중인 유령이 있을 때
        while (nextArrivalAt && now >= nextArrivalAt && ghostPool > 0) {
            ghostsArrived++;
            ghostPool--;

            // 다음 유령 도착 시간 스케줄링 (5분 ~ 30분 뒤)
            // 루프를 돌면서 "그 다음 유령"은 언제 도착했어야 했는지 계산
            nextArrivalAt = new Date(nextArrivalAt.getTime() + getNextIntervalMs());
        }

        // 만약 유령이 다 도착해서 pool이 0이 되었다면, 스케줄 초기화 (또는 루프 종료 후 남은 시간이 미래라면 유지)
        if (ghostPool === 0) {
            nextArrivalAt = null;
        }

        // 3. 새로운 유령 모집 (순차적 확률 게임)
        // 이번 클릭으로 새로운 유령들이 대기열에 추가됩니다.
        const newGhosts = getTieredGhostCount();
        ghostPool += newGhosts;

        // 4. 스케줄링 보정
        // 만약 대기 중인 유령은 있는데 스케줄이 없다면(첫 유입 or 다 도착 직후) 새로 잡습니다.
        // 또는 위 루프를 통해 nextArrivalAt이 미래로 설정되어 있다면 그대로 둡니다.
        if (ghostPool > 0 && (!nextArrivalAt || nextArrivalAt <= now)) {
            nextArrivalAt = new Date(now.getTime() + getNextIntervalMs());
        }

        // 5. 최종 업데이트
        // 실제 조회수 증가 = (진짜 유저 1명) + (도착한 유령들)
        const vistorsIncrement = 1 + ghostsArrived;

        await db.query(
            `UPDATE episodes 
       SET views = views + $1, 
           ghost_pool = $2, 
           next_jackpot_at = $3 
       WHERE id = $4`,
            [vistorsIncrement, ghostPool, nextArrivalAt ? nextArrivalAt.toISOString() : null, id]
        );

        return NextResponse.json({
            success: true,
            views: currentViews + vistorsIncrement,
            ghosts_arrived: ghostsArrived,
            ghost_pool_remaining: ghostPool,
            next_arrival: nextArrivalAt,
            new_ghosts_added: newGhosts
        });

    } catch (error) {
        console.error("View Count Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

import { NextResponse } from "next/server";
import db from "../../../../db";

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

        // 3. 새로운 유령 모집 (첫 클릭 시에만)
        // 처음 클릭 시에만 유령을 생성합니다. 이미 유령이 있으면 추가하지 않습니다.
        let newGhosts = 0;
        if (currentViews === 0 && ghostPool === 0) {
            // 1-50명 중 랜덤 선택 (1명 확률 높음, 50명 확률 낮음)
            // 지수 분포: 작은 수일수록 확률 높음
            const rand = Math.random();
            if (rand < 0.4) {
                newGhosts = Math.floor(Math.random() * 5) + 1; // 1-5명 (40%)
            } else if (rand < 0.7) {
                newGhosts = Math.floor(Math.random() * 10) + 6; // 6-15명 (30%)
            } else if (rand < 0.9) {
                newGhosts = Math.floor(Math.random() * 15) + 16; // 16-30명 (20%)
            } else {
                newGhosts = Math.floor(Math.random() * 20) + 31; // 31-50명 (10%)
            }
            ghostPool = newGhosts;
        }

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

import { NextResponse } from "next/server";
import db from "../../../../db";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // 1. 현재 상태 조회 (ghost_pool, last_viewed_at 추가)
        // last_viewed_at이 없으면(NULL) 지금으로 취급
        const result = await db.query(
            `SELECT views, ghost_pool, last_viewed_at FROM episodes WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Episode not found" }, { status: 404 });
        }

        const row = result.rows[0];
        const currentViews = parseInt(row.views || "0");
        const ghostPool = parseInt(row.ghost_pool || "0");
        const lastViewedAt = row.last_viewed_at ? new Date(row.last_viewed_at) : new Date();
        const now = new Date();

        // 2. 시간 경과에 따른 유령 도착 처리 (Echo Effect)
        // 마지막 조회로부터 몇 초 지났는지 계산
        const secondsPassed = (now.getTime() - lastViewedAt.getTime()) / 1000;

        // 유령 도착 속도: 평균 15초당 1명씩 도착한다고 가정 (랜덤성 부여 가능하지만, 계산은 단순화)
        // 너무 빨리 다 도착하면 재미없으니 천천히 오게 설정
        const ghostsArrived = Math.min(ghostPool, Math.floor(secondsPassed / 15));

        const remainingGhosts = ghostPool - ghostsArrived;

        // 3. 새로운 유령 모집 (확률 게임)
        // 이번 클릭으로 인해 미래에 도착할 유령들이 생성됨
        let newGhosts = 0;
        const rand = Math.random() * 100;

        // 40% 확률로 유령 1~3명 추가 (잔잔한 유입)
        if (rand < 40) {
            newGhosts = Math.floor(Math.random() * 3) + 1;
        }
        // 10% 확률로 유령 4~8명 추가 (갑작스런 유입)
        else if (rand < 50) {
            newGhosts = Math.floor(Math.random() * 5) + 4;
        }
        // 나머지 50%는 유령 없음 (조회수 1만 오름)

        // 4. 최종 업데이트 값 계산
        // 실제 조회수 증가 = (진짜 유저 1명) + (도착한 유령들)
        const vistorsIncrement = 1 + ghostsArrived;
        const nextGhostPool = remainingGhosts + newGhosts;

        await db.query(
            `UPDATE episodes 
       SET views = views + $1, 
           ghost_pool = $2, 
           last_viewed_at = NOW() 
       WHERE id = $3`,
            [vistorsIncrement, nextGhostPool, id]
        );

        return NextResponse.json({
            success: true,
            views: currentViews + vistorsIncrement,
            ghosts_arrived: ghostsArrived,
            ghost_pool_remaining: nextGhostPool
        });

    } catch (error) {
        console.error("View Count Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

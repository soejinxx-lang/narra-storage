import { NextResponse } from "next/server";
import db from "../../../../db";

// 가중치 랜덤 (1이 나올 확률이 높고, 100이 나올 확률은 낮음)
// y = 1/x 보다는 조금 더 완만하게, 1~100 사이 랜덤
function getWeightedBoostAmount(): number {
    // 간단한 구현: 1~10 사이 숫자를 먼저 뽑고, 거기서 확률적으로 가중치 부여
    // 70% 확률로 1~3, 20% 확률로 4~10, 9% 확률로 11~50, 1% 확률로 51~100
    const rand = Math.random() * 100;
    if (rand < 70) return Math.floor(Math.random() * 3) + 1; // 1~3
    if (rand < 90) return Math.floor(Math.random() * 7) + 4; // 4~10
    if (rand < 99) return Math.floor(Math.random() * 40) + 11; // 11~50
    return Math.floor(Math.random() * 50) + 51; // 51~100
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Next.js 15+ params are promises
) {
    const { id } = await params;

    try {
        // 1. 현재 상태 조회
        const result = await db.query(
            `SELECT views, next_jackpot_at FROM episodes WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Episode not found" }, { status: 404 });
        }

        const { views, next_jackpot_at } = result.rows[0];
        const now = new Date();

        let boostAmount = 0;
        let newNextJackpot = next_jackpot_at;
        let isJackpot = false;

        // 2. 잭팟 체크
        // next_jackpot_at이 null이면(처음) 바로 잭팟을 터뜨리는 게 아니라, "첫 잭팟 시간"을 미래로 설정만 하고 넘어감.
        // 이렇게 해야 "바로 랜덤하게 올라가버리는" 현상을 방지하고, 자연스럽게 시간이 지난 뒤에 터짐.
        if (!next_jackpot_at) {
            const hoursToAdd = Math.floor(Math.random() * 100) + 1;
            const nextTime = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
            newNextJackpot = nextTime.toISOString();
            // 처음엔 잭팟 없음 (boostAmount = 0)
        }
        else if (now > new Date(next_jackpot_at)) {
            isJackpot = true;
            boostAmount = getWeightedBoostAmount();

            // 다음 잭팟 시간 예약 (1시간 ~ 100시간 사이 랜덤)
            const hoursToAdd = Math.floor(Math.random() * 100) + 1;
            const nextTime = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
            newNextJackpot = nextTime.toISOString();
        }

        // 3. 업데이트 (기본 +1, 잭팟이면 +boostAmount)
        const finalIncrement = 1 + boostAmount;

        await db.query(
            `UPDATE episodes 
       SET views = views + $1, next_jackpot_at = $2 
       WHERE id = $3`,
            [finalIncrement, newNextJackpot, id]
        );

        return NextResponse.json({
            success: true,
            views: views + finalIncrement,
            jackpot: isJackpot
        });

    } catch (error) {
        console.error("View Count Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

import { NextResponse, NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: { id: string };
  }
) {
  const { id } = params;

  return NextResponse.json({
    id,
    title: "",
    description: "",
  });
}

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: {
    params: { id: string };
  }
) {
  const { id } = params;

  // 1. 해당 소설의 에피소드 목록 조회 (내부 API, 상대 경로)
  const episodesRes = await fetch(
    `/api/novels/${id}/episodes`,
    { method: "GET" }
  );

  if (!episodesRes.ok) {
    return NextResponse.json(
      { error: "Failed to load episodes" },
      { status: episodesRes.status }
    );
  }

  const episodesData = await episodesRes.json();
  const episodes = episodesData.episodes ?? [];

  // 2. 모든 에피소드 삭제
  for (const ep of episodes) {
    const delEpRes = await fetch(
      `/api/novels/${id}/episodes/${ep.ep}`,
      { method: "DELETE" }
    );

    if (!delEpRes.ok) {
      return NextResponse.json(
        { error: "Failed to delete episode" },
        { status: delEpRes.status }
      );
    }
  }

  // 3. 작품 자체 삭제 (현재는 mock이므로 성공 응답만 반환)
  // ⚠️ 실제 DB 도입 전까지는 이게 맞는 동작
  return NextResponse.json({ ok: true });
}

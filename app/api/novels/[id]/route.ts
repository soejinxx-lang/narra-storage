import { NextResponse, NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  return NextResponse.json({
    id,
    title: "",
    description: "",
  });
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  // ✅ 핵심: 요청 들어온 origin 그대로 사용
  const origin = new URL(req.url).origin;

  const episodesRes = await fetch(
    `${origin}/api/novels/${id}/episodes`,
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

  for (const ep of episodes) {
    const delEpRes = await fetch(
      `${origin}/api/novels/${id}/episodes/${ep.ep}`,
      { method: "DELETE" }
    );

    if (!delEpRes.ok) {
      return NextResponse.json(
        { error: "Failed to delete episode" },
        { status: delEpRes.status }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

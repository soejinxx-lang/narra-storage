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

  const episodesRes = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/novels/${id}/episodes`,
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
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/novels/${id}/episodes/${ep.ep}`,
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

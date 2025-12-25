import { NextResponse, NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; ep: string }>;
  }
) {
  const { id, ep } = await params;

  return NextResponse.json({
    novelId: id,
    ep: Number(ep),
    title: "",
    content: "",
  });
}

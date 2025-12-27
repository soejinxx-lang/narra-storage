import { NextResponse, NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: { id: string; ep: string };
  }
) {
  const { id, ep } = params;

  return NextResponse.json({
    novelId: id,
    ep: Number(ep),
    title: "",
    content: "",
  });
}

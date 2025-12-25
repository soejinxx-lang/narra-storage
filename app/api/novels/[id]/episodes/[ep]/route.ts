import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: { id: string; ep: string };
  }
) {
  return NextResponse.json({
    novelId: params.id,
    ep: Number(params.ep),
    title: "",
    content: "",
  });
}

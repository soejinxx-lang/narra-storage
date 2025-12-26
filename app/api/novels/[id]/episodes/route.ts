import { NextResponse, NextRequest } from "next/server";

const STORAGE_BASE_URL = process.env.NEXT_PUBLIC_STORAGE_BASE_URL;

export async function GET(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  if (!STORAGE_BASE_URL) {
    return NextResponse.json(
      { error: "STORAGE_BASE_URL not configured" },
      { status: 500 }
    );
  }

  const res = await fetch(`${STORAGE_BASE_URL}/novels/${id}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Novel not found" },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}

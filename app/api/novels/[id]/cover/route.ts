import { NextRequest, NextResponse } from "next/server";

// 수정된 부분: 환경변수 이름 변경
const STORAGE_BASE =
  process.env.STORAGE_BASE_URL ||
  "https://narra-storage-production.up.railway.app/api";

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await context.params;

  const formData = await req.formData();

  const res = await fetch(
    `${STORAGE_BASE}/novels/${id}/cover`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: "STORAGE_UPLOAD_FAILED", detail: text },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data, { status: 200 });
}

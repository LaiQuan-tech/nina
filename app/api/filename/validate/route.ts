import { NextResponse } from "next/server";
import { parseFilename } from "@/lib/filename/parser";

export const runtime = "nodejs";

// POST { fileName } → { ok, result }
// 只驗檔名（不傳 bytes），便宜、可反覆改名重驗。errors[] 給前端 / AI 產生引導。
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { fileName?: string };
  const fileName = body.fileName;
  if (typeof fileName !== "string" || !fileName.trim()) {
    return NextResponse.json({ ok: false, error: "no_filename" }, { status: 400 });
  }
  const result = parseFilename(fileName.trim());
  return NextResponse.json({ ok: result.ok, result });
}

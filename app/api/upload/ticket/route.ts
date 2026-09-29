import { NextResponse } from "next/server";
import { createPrintFileUploadUrl } from "@/lib/storage";
import { issueUploadTicket } from "@/lib/upload/flow";
import { newPrintFilePath } from "@/lib/upload/path";
import { uploadTicketKeyFromEnv } from "@/lib/upload/ticket";

// node:crypto（票券 HMAC）
export const runtime = "nodejs";

// POST { fileName, size, contentType } → 伺服器重驗檔名／副檔名／大小（唯一守門，永不信任前端）
// → 分配 storage 路徑 → 回 { ok, uploadUrl, ticket, contentType }。
// 檔案本身不經過這裡：Vercel 函式請求主體上限 4.5MB（平台層擋、回 413 FUNCTION_PAYLOAD_TOO_LARGE），
// 所以瀏覽器拿 uploadUrl 直接 PUT 到 Supabase Storage，傳完再帶 ticket 打 /api/upload/complete 建單。
// 上傳不需登入（會員選填），跟舊的 /api/upload 一樣開放。
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await issueUploadTicket(body, {
    ticketKey: uploadTicketKeyFromEnv(),
    now: Date.now,
    newPath: (fileName) => newPrintFilePath(fileName),
    createUploadUrl: createPrintFileUploadUrl,
  });
  return NextResponse.json(result.body, { status: result.status });
}

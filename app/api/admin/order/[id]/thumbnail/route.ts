import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/adminAuth";
import { getWorkOrder, isWorkOrderReadOnly } from "@/lib/workOrders";
import { createAdminSupabase } from "@/lib/supabase";
import { uploadThumbnail } from "@/lib/storage";
import { renderToThumbnailJpeg } from "@/lib/thumbnail/generate";

// PDFium 渲染＋sharp 轉檔可能要跑幾秒，給足時間（照 site-images 慣例仍走 nodejs runtime）。
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

async function currentAdminId(): Promise<string | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!token || !secret) return null;
  return (await readSessionToken(token, secret))?.sub ?? null;
}

function hasTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

/** magic bytes 白名單：jpeg/png/webp/pdf（不信副檔名，只看內容——沿用 site-images 慣例）。 */
function detectAllowedType(bytes: Uint8Array): "jpeg" | "png" | "webp" | "pdf" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf";
  }
  return null;
}

/**
 * POST multipart({ file, kind: "thumbnail" | "diagram" }) → 人工補圖（自動管線失敗或
 * .ai 打不開時的退路）。統一走 renderToThumbnailJpeg 轉成 JPEG 存進私有 bucket，
 * 路徑刻意含 "-manual-"：lib/thumbnail/generate.ts 的自動管線看到就會跳過、不會覆蓋人工補的圖。
 *
 * kind=diagram 只寫 diagram_path，不動 thumbnail_status——那個欄位只描述「自動縮圖管線」的狀態，
 * 補一張加工示意圖跟縮圖有沒有產出是兩件事，混在一起會讓 ensureThumbnail() 誤判成「已處理」而不再重試。
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!hasTrustedOrigin(req)) {
    return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }

  const adminId = await currentAdminId();
  if (!adminId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const order = await getWorkOrder(params.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (isWorkOrderReadOnly(order)) {
    return NextResponse.json({ ok: false, error: "demo_read_only" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind = kindRaw === "diagram" ? "diagram" : kindRaw === "thumbnail" ? "thumbnail" : null;
  if (!kind) {
    return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "empty_file" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ ok: false, error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!detectAllowedType(bytes)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  const jpeg = await renderToThumbnailJpeg(bytes);
  if (!jpeg) {
    return NextResponse.json({ ok: false, error: "render_failed" }, { status: 422 });
  }

  const path = `thumbs/${order.id}-manual-${kind}-${Date.now()}.jpg`;
  const uploaded = await uploadThumbnail(path, jpeg);
  if (!uploaded) {
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 502 });
  }

  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ ok: false, error: "db_not_configured" }, { status: 502 });

  const patch: Record<string, unknown> =
    kind === "diagram" ? { diagram_path: path } : { thumbnail_path: path, thumbnail_status: "manual" };

  const { data, error } = await db
    .from("work_orders")
    .update(patch)
    .eq("id", order.id)
    .select("id, thumbnail_path, diagram_path, thumbnail_status")
    .single();
  if (error) {
    console.error("[admin/order/thumbnail] db update failed:", error.message);
    return NextResponse.json({ ok: false, error: "db_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, order: data });
}

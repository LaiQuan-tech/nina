import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/adminAuth";
import { MAX_SITE_IMAGE_BYTES, validateSiteImageInput } from "@/lib/site/imageUpload";
import { listSiteImageRecords, uploadSiteImage } from "@/lib/site/siteImages";

export const runtime = "nodejs";

const ERROR_MESSAGES: Record<string, string> = {
  unknown_slot: "找不到這個圖片位置",
  empty_file: "請選擇圖片檔",
  too_large: "圖片不可超過 8 MB",
  unsupported_type: "只接受 JPG、PNG 或 WebP",
  invalid_signature: "檔案內容不是有效的圖片格式",
};

async function currentAdminId(): Promise<string | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!token || !secret) return null;
  return (await readSessionToken(token, secret))?.sub ?? null;
}

function safeDimension(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value)) return undefined;
  const dimension = Number(value);
  return dimension >= 1 && dimension <= 20_000 ? dimension : undefined;
}

function hasTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, images: await listSiteImageRecords() });
  } catch (error) {
    console.error("[site-images] list failed", error);
    return NextResponse.json({ ok: false, error: "list_failed", message: "圖片清單載入失敗" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!hasTrustedOrigin(req)) {
    return NextResponse.json({ ok: false, error: "bad_origin", message: "無效的請求來源" }, { status: 403 });
  }

  const adminId = await currentAdminId();
  if (!adminId) {
    return NextResponse.json({ ok: false, error: "unauthorized", message: "請重新登入" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form", message: "無法讀取上傳內容" }, { status: 400 });
  }

  const slotKey = typeof form.get("slotKey") === "string" ? String(form.get("slotKey")).trim() : "";
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "empty_file", message: ERROR_MESSAGES.empty_file }, { status: 400 });
  }
  if (file.size > MAX_SITE_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large", message: ERROR_MESSAGES.too_large }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateSiteImageInput(slotKey, bytes, file.type, file.size);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error, message: ERROR_MESSAGES[validation.error] },
      { status: validation.error === "too_large" ? 413 : 400 }
    );
  }

  try {
    const image = await uploadSiteImage({
      slot: validation.slot,
      bytes,
      mimeType: file.type,
      extension: validation.extension,
      adminId,
      width: safeDimension(form.get("width")),
      height: safeDimension(form.get("height")),
    });
    revalidatePath("/");
    return NextResponse.json({ ok: true, image });
  } catch (error) {
    console.error("[site-images] upload failed", error);
    return NextResponse.json({ ok: false, error: "upload_failed", message: "圖片上傳失敗，原圖未變更" }, { status: 502 });
  }
}

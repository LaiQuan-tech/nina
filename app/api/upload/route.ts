import { NextResponse } from "next/server";
import { parseFilename } from "@/lib/filename/parser";
import { uploadPrintFile } from "@/lib/storage";
import { createWorkOrder } from "@/lib/workOrders";
import { lookupProduct } from "@/lib/productLookup";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

// POST multipart(file) → 伺服器端「再驗一次」parser（唯一真相，永不信任前端）
// → 存 Storage → 建工單 → { ok, orderId, orderNo }
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  // ★ 伺服器端重驗檔名 —— 收檔的唯一守門
  const parsed = parseFilename(file.name);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "bad_filename", result: parsed }, { status: 422 });
  }

  const bytes = await file.arrayBuffer();
  const path = await uploadPrintFile(file.name, bytes, file.type);
  if (!path) {
    return NextResponse.json({ ok: false, error: "storage_failed" }, { status: 502 });
  }

  // 用檔名末段商品碼查 ERP 商品主檔（soft：查不到仍收檔，工單標非標準商品）
  const match = await lookupProduct(parsed.segments.spec);
  const product = match
    ? { productName: match.name, productCode: match.code, matched: true }
    : { productName: parsed.segments.productName, productCode: null, matched: false };

  try {
    const order = await createWorkOrder(parsed.segments, file.name, path, product);
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderNo: order.order_no,
      productMatched: product.matched,
      productName: product.productName,
    });
  } catch (err) {
    console.error("[upload] createWorkOrder failed:", err);
    return NextResponse.json({ ok: false, error: "db_failed" }, { status: 502 });
  }
}

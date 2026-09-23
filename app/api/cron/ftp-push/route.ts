import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/adminAuth";
import { createAdminSupabase } from "@/lib/supabase";
import { pushWorkOrderToFtp, type FtpPushableOrder } from "@/lib/ftp/push";
import { isValidCronSecret } from "@/lib/cron/cronAuth";

// Vercel Cron 定期打這支（見 vercel.json 的 crons 設定），把 ftp_status='pending' 的工單
// 逐筆推上 NAS；也允許已登入的後台管理員直接打這支手動觸發。這支路徑不在 middleware.ts
// 的 /api/admin/* 保護範圍內（matcher 沒收 /api/cron/*），認證邏輯全部自己做。
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 20;
const MAX_TRIES = 5;

type PendingRow = {
  id: string;
  storage_path: string;
  file_name: string;
  customer_name: string | null;
  ftp_meta: Record<string, unknown> | null;
};

async function hasValidAdminCookie(): Promise<boolean> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!token || !secret) return false;
  const session = await readSessionToken(token, secret);
  return Boolean(session?.sub);
}

async function isAuthorized(req: Request): Promise<boolean> {
  if (isValidCronSecret(req.headers.get("authorization"), process.env.CRON_SECRET)) return true;
  return hasValidAdminCookie();
}

/**
 * 逐筆推送，個別 try/catch——單筆失敗（含事後寫 DB 失敗）都不能讓其他筆停擺。
 * 成功：ftp_status='ok' + ftp_path + ftp_meta.pushed_at。
 * 失敗：tries+1；未達 MAX_TRIES 前維持 'pending' 供下次 Cron 重試，達到才停到 'failed'。
 */
async function processPendingRow(
  db: NonNullable<ReturnType<typeof createAdminSupabase>>,
  row: PendingRow,
): Promise<"ok" | "failed"> {
  const baseMeta = row.ftp_meta ?? {};
  try {
    const order: FtpPushableOrder = {
      storage_path: row.storage_path,
      file_name: row.file_name,
      customer_name: row.customer_name,
    };
    const result = await pushWorkOrderToFtp(order);
    const { error } = await db
      .from("work_orders")
      .update({
        ftp_status: "ok",
        ftp_path: result.remotePath,
        ftp_meta: { ...baseMeta, pushed_at: new Date().toISOString(), last_error: null },
      })
      .eq("id", row.id);
    if (error) console.error(`[cron/ftp-push] 標記成功失敗 (${row.id}):`, error.message);
    return "ok";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/ftp-push] 推送失敗 (${row.id}):`, message);
    try {
      const tries = Number((baseMeta as { tries?: unknown }).tries ?? 0) + 1;
      const nextStatus = tries >= MAX_TRIES ? "failed" : "pending";
      const { error } = await db
        .from("work_orders")
        .update({
          ftp_status: nextStatus,
          ftp_meta: { ...baseMeta, tries, last_error: message, last_try_at: new Date().toISOString() },
        })
        .eq("id", row.id);
      if (error) console.error(`[cron/ftp-push] 記錄失敗狀態失敗 (${row.id}):`, error.message);
    } catch (writeErr) {
      console.error(`[cron/ftp-push] 記錄失敗狀態時拋錯 (${row.id}):`, writeErr);
    }
    return "failed";
  }
}

async function handlePendingBatch(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = createAdminSupabase();
  if (!db) return NextResponse.json({ ok: false, error: "db_not_configured" }, { status: 502 });

  const { data, error } = await db
    .from("work_orders")
    .select("id, storage_path, file_name, customer_name, ftp_meta")
    .eq("ftp_status", "pending")
    .eq("is_demo", false)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[cron/ftp-push] 撈待推清單失敗:", error.message);
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 502 });
  }

  const rows = (data ?? []) as PendingRow[];
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const outcome = await processPendingRow(db, row);
    if (outcome === "ok") ok++;
    else failed++;
  }

  return NextResponse.json({ processed: rows.length, ok, failed });
}

// Vercel Cron 一律用 GET 觸發；POST 留給手動 curl 測試方便。
export async function GET(req: Request) {
  return handlePendingBatch(req);
}

export async function POST(req: Request) {
  return handlePendingBatch(req);
}

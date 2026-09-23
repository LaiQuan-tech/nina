import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/admin/adminRequest";
import { getAdminById } from "@/lib/adminUsers";
import { recordScan } from "@/lib/workOrderScans";

export const runtime = "nodejs";

const MAX_RAW_LEN = 64;
// 控制字元（含 DEL）一律拒收——掃描槍偶爾會夾帶終端機控制碼，不是預期輸入。
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

function sanitizeRaw(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > MAX_RAW_LEN || CONTROL_CHAR_RE.test(trimmed)) return null;
  return trimmed;
}

function sanitizeFallbackStation(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// ── best-effort 速率限制：process 內 token bucket，keyed by adminId ──────────
// 容量 10、每 5 秒回滿 10 顆（≈2 顆/秒）。這是「擋卡鍵」用的最後防線，不是真正的
// API 配額系統：狀態存在單一 process 記憶體裡，多實例（例如 Vercel 多個 lambda）
// 各自維護一份、彼此不共享，理論上可以繞過；但這支端點本來就只給登入後的內部
// 管理員用，真正想擋的是「掃描槍卡鍵狂送同一單」這種意外情境，不是防惡意攻擊。
const RATE_CAPACITY = 10;
const RATE_REFILL_MS = 5000;
const buckets = new Map<string, { tokens: number; updatedAt: number }>();

function consumeToken(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: RATE_CAPACITY, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  const refilled = Math.min(RATE_CAPACITY, bucket.tokens + (elapsed / RATE_REFILL_MS) * RATE_CAPACITY);
  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return false;
  }
  buckets.set(key, { tokens: refilled - 1, updatedAt: now });
  return true;
}

// POST { raw, fallbackStation? } → 記一筆掃描事件，回工單摘要＋重算後的進度。
// 錯誤碼：400 bad_payload / 401 unauthorized / 403 bad_origin|demo_read_only /
// 404 order_not_found / 429 rate_limited / 500 scan_failed。
export async function POST(req: Request) {
  const auth = await authorizeAdminRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (!consumeToken(auth.adminId)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { raw?: unknown; fallbackStation?: unknown };
  const raw = sanitizeRaw(body.raw);
  if (!raw) return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  const fallbackStation = sanitizeFallbackStation(body.fallbackStation);

  // admin_name 一律 server 端依 cookie 的 sub 查 admin_users，不信任前端傳來的任何名字欄位。
  const admin = await getAdminById(auth.adminId);
  const adminName = admin?.name || admin?.email || "管理員";

  const result = await recordScan({ raw, fallbackStation, adminId: auth.adminId, adminName });
  if (!result.ok) {
    const status =
      result.error === "order_not_found" ? 404 : result.error === "demo_read_only" ? 403 : result.error === "scan_failed" ? 500 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  // result 在這裡已經是 { ok: true, ... } 的分支（上面 !result.ok 已經 return 過了），
  // 不用也不能再疊一次 ok: true——TS 會擋「同一個 key 被指定兩次」。
  return NextResponse.json(result);
}

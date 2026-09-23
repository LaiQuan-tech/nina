/**
 * 掃描站核心：掃描槍/手動輸入 → 解析 → 查工單 → 記事件 → 重算進度快取。
 *
 * 設計原則（比照 lib/workOrderValidation.ts）：純解析/判斷邏輯拆成獨立匯出函式，
 * 零外部依賴、可離線單元測試；真正碰 DB 的部分（recordScan／recordManualStationOverride）
 * 只負責組裝這些已驗證過的純函式，本身不用再測——這也是這個專案既有的測試慣例
 * （getWorkOrder/updateWorkOrder 等碰 DB 的函式從來不被直接單元測試，只測它們呼叫的純邏輯）。
 */
import { createAdminSupabase } from "@/lib/supabase";
import { decodeBarcode, STATION_LABELS, type StationKey } from "./workOrder/barcode";
import { deriveOrderProgress } from "./workOrderStations";
import { isWorkOrderReadOnly, type WorkOrder } from "./workOrders";

const STATION_KEYS: StationKey[] = ["output", "process", "accessory", "packed", "delivered"];

function normalizeStationKey(v: string | null | undefined): StationKey | null {
  if (!v) return null;
  return (STATION_KEYS as string[]).includes(v) ? (v as StationKey) : null;
}

export type ParsedScanInput = { ok: true; orderNo: string; station: StationKey } | { ok: false; error: "bad_payload" };

/**
 * 純函式、不碰 DB：raw（掃描槍輸入或手動輸入）＋ fallbackStation → {orderNo, station}。
 * 先試 decodeBarcode（12 碼條碼 payload）；解不出來就把 raw 當裸 order_no
 * （去頭尾空白／`*`、轉大寫），station 改用 fallbackStation。
 * 兩條路都湊不出合法結果（order_no 是空字串，或站別不在白名單內）→ bad_payload。
 */
export function parseScanInput(raw: string, fallbackStation?: string | null): ParsedScanInput {
  const trimmedRaw = String(raw ?? "").trim();

  const decoded = decodeBarcode(trimmedRaw);
  if (decoded) {
    return { ok: true, orderNo: decoded.orderNo, station: decoded.station };
  }

  const orderNo = trimmedRaw.replace(/^\*+|\*+$/g, "").trim().toUpperCase();
  const station = normalizeStationKey(fallbackStation);
  if (!orderNo || !station) {
    return { ok: false, error: "bad_payload" };
  }
  return { ok: true, orderNo, station };
}

export type OrderScanEligibility =
  | { ok: true }
  | { ok: false; error: "order_not_found" }
  | { ok: false; error: "demo_read_only" };

/** 純函式、不碰 DB：查到的工單列（或查無 → null）→ 能不能繼續記錄這筆掃描事件。 */
export function evaluateOrderForScan(order: Pick<WorkOrder, "is_demo"> | null | undefined): OrderScanEligibility {
  if (!order) return { ok: false, error: "order_not_found" };
  if (isWorkOrderReadOnly(order)) return { ok: false, error: "demo_read_only" };
  return { ok: true };
}

export type RecordScanResult =
  | {
      ok: true;
      order: { order_no: string; customer_name: string | null; product_name: string | null };
      station: StationKey;
      stationLabel: string;
      duplicate: boolean;
      firstAt?: string;
      firstAdminName?: string | null;
      progress: { station: StationKey | null; status: "open" | "in_progress" | "done" };
    }
  | { ok: false; error: "bad_payload" | "order_not_found" | "demo_read_only" | "scan_failed" };

type ScanTargetOrder = {
  id: string;
  order_no: string | null;
  customer_name: string | null;
  product_name: string | null;
  is_demo: boolean;
};

/**
 * 記一筆掃描事件：解析 → 查工單（含 demo 擋）→ 查同站既有事件（只為 duplicate 旗標，
 * 不擋、照記）→ insert 事件 → 重讀全部事件跑 deriveOrderProgress → 回寫 work_orders 快取。
 *
 * 現場螢幕半公開（工廠貼牆上任何人看得到），回傳刻意不含 storage_path/parsed/phone。
 */
export async function recordScan(input: {
  raw: string;
  fallbackStation?: string | null;
  adminId: string | null;
  adminName: string;
}): Promise<RecordScanResult> {
  const parsed = parseScanInput(input.raw, input.fallbackStation);
  if (!parsed.ok) return { ok: false, error: "bad_payload" };

  const db = createAdminSupabase();
  if (!db) return { ok: false, error: "scan_failed" };

  const { data: existing } = await db
    .from("work_orders")
    .select("id, order_no, customer_name, product_name, is_demo")
    .eq("order_no", parsed.orderNo)
    .maybeSingle();

  const eligibility = evaluateOrderForScan(existing as ScanTargetOrder | null);
  if (!eligibility.ok) return { ok: false, error: eligibility.error };
  const order = existing as ScanTargetOrder;

  // 只為了 duplicate 旗標查一次「這單這站」最早的一筆——不擋，插入照樣往下走。
  const { data: sameStationEvents } = await db
    .from("work_order_events")
    .select("scanned_at, admin_name")
    .eq("work_order_id", order.id)
    .eq("station", parsed.station)
    .order("scanned_at", { ascending: true })
    .limit(1);
  const first = (sameStationEvents as { scanned_at: string; admin_name: string | null }[] | null)?.[0];
  const duplicate = Boolean(first);

  const { error: insertError } = await db.from("work_order_events").insert({
    work_order_id: order.id,
    station: parsed.station,
    admin_id: input.adminId,
    admin_name: input.adminName,
  });
  if (insertError) {
    console.error("[workOrderScans] recordScan insert event failed:", insertError.message);
    return { ok: false, error: "scan_failed" };
  }

  const { data: allEvents } = await db
    .from("work_order_events")
    .select("station, scanned_at")
    .eq("work_order_id", order.id);
  const progress = deriveOrderProgress((allEvents as { station: StationKey; scanned_at: string }[] | null) ?? []);

  const { error: updateError } = await db
    .from("work_orders")
    .update({ station: progress.station, status: progress.status })
    .eq("id", order.id)
    .eq("is_demo", false);
  if (updateError) {
    // 事件已經記到了（稽核紀錄不遺失），只是快取欄位這次沒跟上——下一次掃描/後台手動存檔
    // 都會用全部事件重算一次，不是永久性的資料錯誤，記 log 但不擋現場繼續掃。
    console.error("[workOrderScans] recordScan update work_orders cache failed:", updateError.message);
  }

  return {
    ok: true,
    order: { order_no: order.order_no ?? parsed.orderNo, customer_name: order.customer_name, product_name: order.product_name },
    station: parsed.station,
    stationLabel: STATION_LABELS[parsed.station],
    duplicate,
    firstAt: first?.scanned_at,
    firstAdminName: first?.admin_name ?? undefined,
    progress,
  };
}

/**
 * 後台手動改「目前站別」時補一筆事件（note 固定「後台手動指定」），讓事件保持唯一真相來源——
 * 下次掃描重算 deriveOrderProgress 時，這筆會以它被寫入的時間點自然參與排序，不會被吃掉。
 * 呼叫端（PATCH /api/admin/order/[id]）應只在 station 真的變更、且新值是合法站別時才呼叫；
 * station 被改回空值（清空）不會呼叫這支——work_order_events.station 有 not null + check
 * 限制，本來就塞不進一筆「清空」事件，讓 work_orders.station 直接變 null 即可。
 * 刻意不重算/覆寫 status：admin 當下選的 status 是明確意圖，不該被這裡的重算蓋掉。
 */
export async function recordManualStationOverride(input: {
  workOrderId: string;
  station: StationKey;
  adminId: string | null;
  adminName?: string | null;
}): Promise<{ ok: boolean }> {
  const db = createAdminSupabase();
  if (!db) return { ok: false };
  const { error } = await db.from("work_order_events").insert({
    work_order_id: input.workOrderId,
    station: input.station,
    admin_id: input.adminId,
    admin_name: input.adminName ?? null,
    note: "後台手動指定",
  });
  if (error) {
    console.error("[workOrderScans] recordManualStationOverride failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

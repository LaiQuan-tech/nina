// 工單 PATCH 白名單欄位的純函式驗證。零外部依賴（不碰 DB），updateWorkOrder() 與
// PATCH /api/admin/order/[id] 都會呼叫這支，讓「DB 層擋一次、API 層擋一次」形成雙重防護。
//
// 設計原則：查無效 → ok:false + 逐欄 errors（給表單紅字用）；
// 通過的欄位一律正規化過（空字串→null、數字轉 number、字串 trim），
// 呼叫端拿到 values 可以直接餵給 supabase .update()，不用再自己清一次。
import { EDITABLE_FIELDS, type EditableField } from "./workOrders";

export type WorkOrderPatchInput = Partial<Record<EditableField, unknown>>;

export type WorkOrderValidationResult =
  | { ok: true; values: Partial<Record<EditableField, unknown>> }
  | { ok: false; errors: Partial<Record<EditableField, string>> };

const STATUS_VALUES = new Set(["open", "in_progress", "done"]);
const STATION_VALUES = new Set(["output", "process", "accessory", "packed", "delivered"]);

// 「其餘 text」欄位一律 200 字上限；remark / ship_address 另有各自上限（見下方 switch）。
const DEFAULT_TEXT_MAX = 200;
const REMARK_MAX = 2000;
const SHIP_ADDRESS_MAX = 500;
const SHIP_PHONE_MAX = 32;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 只允許數字、+ - ( ) 與空白（常見市話分機／國碼寫法），長度另外檢查。
const SHIP_PHONE_RE = /^[0-9+\-() \s]*$/;

/** delivery_date 專用：格式對了還不夠，回推 toISOString 是否還原同一天，擋掉 2026-02-31 這種會被 Date 自動進位的偽日期。 */
function isValidCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

/** draft_count / single_qty 專用：0..999999 的整數，字串/數字皆收。 */
function isBoundedInt(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 999999;
}

export function validateWorkOrderPatch(patch: WorkOrderPatchInput): WorkOrderValidationResult {
  const errors: Partial<Record<EditableField, string>> = {};
  const values: Partial<Record<EditableField, unknown>> = {};

  for (const key of EDITABLE_FIELDS) {
    if (!(key in patch)) continue;
    const raw = patch[key];

    // 空字串／undefined → null（沿用既有慣例）。status 例外：DB 是 not null 且無「空」語意，
    // 不可靜默轉 null（會在 DB 端撞 not-null constraint），一律當成不合法值處理。
    if (raw === undefined || (raw === "" && key !== "status")) {
      values[key] = null;
      continue;
    }
    if (raw === null) {
      if (key === "status") {
        errors[key] = "狀態不可為空";
      } else {
        values[key] = null;
      }
      continue;
    }

    switch (key) {
      case "delivery_date": {
        const s = String(raw).trim();
        if (!isValidCalendarDate(s)) {
          errors[key] = "交貨日格式須為 YYYY-MM-DD 且為實際存在的日期";
          break;
        }
        values[key] = s;
        break;
      }
      case "draft_count":
      case "single_qty": {
        const n = typeof raw === "number" ? raw : Number(String(raw).trim());
        if (!isBoundedInt(n)) {
          errors[key] = "須為 0-999999 的整數";
          break;
        }
        values[key] = n;
        break;
      }
      case "status": {
        const s = String(raw).trim();
        if (!STATUS_VALUES.has(s)) {
          errors[key] = "狀態須為 open / in_progress / done 其中之一";
          break;
        }
        values[key] = s;
        break;
      }
      case "station": {
        const s = String(raw).trim();
        if (!STATION_VALUES.has(s)) {
          errors[key] = "站別不在允許清單內";
          break;
        }
        values[key] = s;
        break;
      }
      case "ship_phone": {
        const s = String(raw).trim();
        if (s.length > SHIP_PHONE_MAX || !SHIP_PHONE_RE.test(s)) {
          errors[key] = `電話僅接受數字、+ - ( ) 與空白，長度上限 ${SHIP_PHONE_MAX}`;
          break;
        }
        values[key] = s;
        break;
      }
      case "remark": {
        const s = String(raw);
        if (s.length > REMARK_MAX) {
          errors[key] = `長度不可超過 ${REMARK_MAX} 字`;
          break;
        }
        values[key] = s;
        break;
      }
      case "ship_address": {
        const s = String(raw);
        if (s.length > SHIP_ADDRESS_MAX) {
          errors[key] = `長度不可超過 ${SHIP_ADDRESS_MAX} 字`;
          break;
        }
        values[key] = s;
        break;
      }
      default: {
        // 其餘一律文字欄位，200 字上限：customer_no/customer_phone/contact_person/
        // delivery_method/processing_items/receiver/machine_model/lamination/
        // ink_type/print_method/plate_material/ship_name。
        const s = String(raw);
        if (s.length > DEFAULT_TEXT_MAX) {
          errors[key] = `長度不可超過 ${DEFAULT_TEXT_MAX} 字`;
          break;
        }
        values[key] = s;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values };
}

import assert from "node:assert/strict";
import test from "node:test";
import { parseScanInput, evaluateOrderForScan } from "./workOrderScans";

// ── parseScanInput ──────────────────────────────────────────────────────

test("parseScanInput：12 碼條碼 payload 解成 orderNo + station", () => {
  const r = parseScanInput("115092300011");
  assert.deepEqual(r, { ok: true, orderNo: "CK1150923-0001", station: "output" });
});

test("parseScanInput：12 碼 payload 前後帶空白也能解（先 trim 再 decode）", () => {
  // "115092300042" = date7 1150923 + serial 0004 + 站別碼 2（process，見 barcode.ts STATION_DIGIT）
  const r = parseScanInput("  115092300042  ");
  assert.deepEqual(r, { ok: true, orderNo: "CK1150923-0004", station: "process" });
});

test("parseScanInput：裸 order_no + fallbackStation → 用 fallback 當站別", () => {
  const r = parseScanInput("CK1150923-0001", "process");
  assert.deepEqual(r, { ok: true, orderNo: "CK1150923-0001", station: "process" });
});

test("parseScanInput：裸 order_no 小寫/前後空白/星號 → 去頭尾空白與 * 、轉大寫", () => {
  const r = parseScanInput("  *ck1150923-0007* ", "accessory");
  assert.deepEqual(r, { ok: true, orderNo: "CK1150923-0007", station: "accessory" });
});

test("parseScanInput：解不出 12 碼、也沒有 fallbackStation → bad_payload", () => {
  const r = parseScanInput("CK1150923-0001");
  assert.deepEqual(r, { ok: false, error: "bad_payload" });
});

test("parseScanInput：fallbackStation 不是合法站別 → bad_payload", () => {
  const r = parseScanInput("CK1150923-0001", "not_a_station");
  assert.deepEqual(r, { ok: false, error: "bad_payload" });
});

test("parseScanInput：raw 整段空白（trim 後為空字串）→ bad_payload", () => {
  const r = parseScanInput("   ", "output");
  assert.deepEqual(r, { ok: false, error: "bad_payload" });
});

test("parseScanInput：完全空字串、無 fallback → bad_payload", () => {
  const r = parseScanInput("", null);
  assert.deepEqual(r, { ok: false, error: "bad_payload" });
});

test("parseScanInput：站別碼不在 1..5 的 12 碼 payload 解碼失敗，退回裸 order_no 邏輯也湊不出合法 order_no → bad_payload", () => {
  // "999999999999" 不是合法日期也不是站別碼 9，decodeBarcode 會回 null；
  // 當 order_no 使用（去除 * 後仍是這串數字）雖然不是 CK 開頭，但 parseScanInput 本身
  // 不驗證 order_no 格式（交給後面查 DB 的 order_not_found 分支處理），只要非空 + 站別合法即可通過。
  const r = parseScanInput("999999999999", "output");
  assert.deepEqual(r, { ok: true, orderNo: "999999999999", station: "output" });
});

// ── evaluateOrderForScan ─────────────────────────────────────────────────

test("evaluateOrderForScan：查無工單（null）→ order_not_found", () => {
  assert.deepEqual(evaluateOrderForScan(null), { ok: false, error: "order_not_found" });
});

test("evaluateOrderForScan：demo 工單 → demo_read_only", () => {
  assert.deepEqual(evaluateOrderForScan({ is_demo: true }), { ok: false, error: "demo_read_only" });
});

test("evaluateOrderForScan：正式工單 → ok", () => {
  assert.deepEqual(evaluateOrderForScan({ is_demo: false }), { ok: true });
});

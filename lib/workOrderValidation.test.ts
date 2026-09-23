import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkOrderPatch } from "./workOrderValidation";

test("delivery_date：正常日期通過", () => {
  const r = validateWorkOrderPatch({ delivery_date: "2026-09-30" });
  assert.deepEqual(r, { ok: true, values: { delivery_date: "2026-09-30" } });
});

test("delivery_date：2026-02-31 會被 Date 進位成 03-03，round-trip 檢查須擋下", () => {
  const r = validateWorkOrderPatch({ delivery_date: "2026-02-31" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors.delivery_date ?? "", /日期/);
});

test("delivery_date：格式不符（非 YYYY-MM-DD）直接擋", () => {
  const r = validateWorkOrderPatch({ delivery_date: "2026/09/30" });
  assert.equal(r.ok, false);
});

test("delivery_date：月份 13 不會讓 Date 拋錯、也要擋下", () => {
  const r = validateWorkOrderPatch({ delivery_date: "2026-13-01" });
  assert.equal(r.ok, false);
});

test("delivery_date：空字串 → null（合法，欄位可清空）", () => {
  const r = validateWorkOrderPatch({ delivery_date: "" });
  assert.deepEqual(r, { ok: true, values: { delivery_date: null } });
});

test("draft_count / single_qty：整數 0..999999 通過", () => {
  const r = validateWorkOrderPatch({ draft_count: 0, single_qty: 999999 });
  assert.deepEqual(r, { ok: true, values: { draft_count: 0, single_qty: 999999 } });
});

test("draft_count：字串數字也接受（表單一律是字串）", () => {
  const r = validateWorkOrderPatch({ draft_count: "12" });
  assert.deepEqual(r, { ok: true, values: { draft_count: 12 } });
});

test("draft_count：超過上限 / 負數 / 小數 一律拒絕", () => {
  assert.equal(validateWorkOrderPatch({ draft_count: 1000000 }).ok, false);
  assert.equal(validateWorkOrderPatch({ draft_count: -1 }).ok, false);
  assert.equal(validateWorkOrderPatch({ draft_count: 1.5 }).ok, false);
  assert.equal(validateWorkOrderPatch({ draft_count: "abc" }).ok, false);
});

test("single_qty：空字串 → null", () => {
  const r = validateWorkOrderPatch({ single_qty: "" });
  assert.deepEqual(r, { ok: true, values: { single_qty: null } });
});

test("status：白名單內通過", () => {
  for (const s of ["open", "in_progress", "done"]) {
    assert.deepEqual(validateWorkOrderPatch({ status: s }), { ok: true, values: { status: s } });
  }
});

test("status：不在白名單內（例 shipped）一律拒絕，不可靜默通過", () => {
  const r = validateWorkOrderPatch({ status: "shipped" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.status);
});

test("status：空字串不可視為合法（DB not null，不可靜默轉 null）", () => {
  const r = validateWorkOrderPatch({ status: "" });
  assert.equal(r.ok, false);
});

test("status：null 也視為不合法", () => {
  const r = validateWorkOrderPatch({ status: null });
  assert.equal(r.ok, false);
});

test("station：五個 key 皆通過，且可為 null／空字串", () => {
  for (const s of ["output", "process", "accessory", "packed", "delivered"]) {
    assert.deepEqual(validateWorkOrderPatch({ station: s }), { ok: true, values: { station: s } });
  }
  assert.deepEqual(validateWorkOrderPatch({ station: null }), { ok: true, values: { station: null } });
  assert.deepEqual(validateWorkOrderPatch({ station: "" }), { ok: true, values: { station: null } });
});

test("station：不在五個 key 內就拒絕", () => {
  assert.equal(validateWorkOrderPatch({ station: "warehouse" }).ok, false);
});

test("remark：2000 字上限，超過拒絕、剛好通過", () => {
  const ok = "字".repeat(2000);
  const bad = "字".repeat(2001);
  assert.equal(validateWorkOrderPatch({ remark: ok }).ok, true);
  assert.equal(validateWorkOrderPatch({ remark: bad }).ok, false);
});

test("ship_address：500 字上限", () => {
  const ok = "地".repeat(500);
  const bad = "地".repeat(501);
  assert.equal(validateWorkOrderPatch({ ship_address: ok }).ok, true);
  assert.equal(validateWorkOrderPatch({ ship_address: bad }).ok, false);
});

test("ship_phone：只允許數字 + - ( ) 空白，長度上限 32", () => {
  assert.equal(validateWorkOrderPatch({ ship_phone: "0912-345 (678)" }).ok, true);
  assert.equal(validateWorkOrderPatch({ ship_phone: "02-1234-5678轉99" }).ok, false); // 中文字不合法
  assert.equal(validateWorkOrderPatch({ ship_phone: "1".repeat(33) }).ok, false);
});

test("其餘文字欄位：200 字上限（以 customer_no 抽樣）", () => {
  const ok = "A".repeat(200);
  const bad = "A".repeat(201);
  assert.equal(validateWorkOrderPatch({ customer_no: ok }).ok, true);
  assert.equal(validateWorkOrderPatch({ customer_no: bad }).ok, false);
});

test("其餘文字欄位：200 字上限對 v2 新欄位同樣生效（以 machine_model 抽樣）", () => {
  const bad = "M".repeat(201);
  const r = validateWorkOrderPatch({ machine_model: bad });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.machine_model);
});

test("未出現在 patch 內的欄位不會出現在 values 裡（保留既有 partial patch 語意）", () => {
  const r = validateWorkOrderPatch({ receiver: "小美" });
  assert.deepEqual(r, { ok: true, values: { receiver: "小美" } });
});

test("多欄位同時錯誤會一次全部回報（給表單一次標紅，不必來回試錯）", () => {
  const r = validateWorkOrderPatch({ status: "shipped", delivery_date: "2026-02-31", draft_count: -1 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.status);
    assert.ok(r.errors.delivery_date);
    assert.ok(r.errors.draft_count);
  }
});

test("空字串一律正規化為 null（一般文字欄位，以 remark 抽樣）", () => {
  assert.deepEqual(validateWorkOrderPatch({ remark: "" }), { ok: true, values: { remark: null } });
});

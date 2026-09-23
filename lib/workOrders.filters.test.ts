import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkOrderSearchTerm, resolveWorkOrderSort } from "./workOrders";

// ── buildWorkOrderSearchTerm ──────────────────────────────────────────
test("buildWorkOrderSearchTerm：一般字串原樣通過（trim 頭尾空白）", () => {
  assert.equal(buildWorkOrderSearchTerm("  CK1150923-0001  "), "CK1150923-0001");
});

test("buildWorkOrderSearchTerm：null / undefined / 空字串 → 空字串", () => {
  assert.equal(buildWorkOrderSearchTerm(null), "");
  assert.equal(buildWorkOrderSearchTerm(undefined), "");
  assert.equal(buildWorkOrderSearchTerm(""), "");
});

test("buildWorkOrderSearchTerm：注入字串 a,b.c)d 會被拆解成安全字串，不留下 or() 結構字元", () => {
  const result = buildWorkOrderSearchTerm("a,b.c)d");
  assert.equal(result, "a b c d");
  assert.doesNotMatch(result, /[,.()*\\%"']/);
});

test("buildWorkOrderSearchTerm：括號、逗號、百分比、引號、反斜線、控制字元全部濾除", () => {
  const raw = "x,y(z)*w\\v%u\"t'r\x01s";
  const result = buildWorkOrderSearchTerm(raw);
  assert.doesNotMatch(result, /[,.()*\\%"'\x00-\x1f]/);
});

test("buildWorkOrderSearchTerm：60 字長字串裁到 40 字", () => {
  const raw = "A".repeat(60);
  const result = buildWorkOrderSearchTerm(raw);
  assert.equal(result.length, 40);
  assert.equal(result, "A".repeat(40));
});

test("buildWorkOrderSearchTerm：清洗後兩側多餘空白已 trim", () => {
  assert.equal(buildWorkOrderSearchTerm("(客戶)"), "客戶");
});

// ── resolveWorkOrderSort ──────────────────────────────────────────────
test("resolveWorkOrderSort：5 種白名單 key 各自映射正確的 column/ascending", () => {
  assert.deepEqual(resolveWorkOrderSort("received_desc"), { column: "received_at", ascending: false });
  assert.deepEqual(resolveWorkOrderSort("received_asc"), { column: "received_at", ascending: true });
  assert.deepEqual(resolveWorkOrderSort("delivery_asc"), { column: "delivery_date", ascending: true });
  assert.deepEqual(resolveWorkOrderSort("delivery_desc"), { column: "delivery_date", ascending: false });
  assert.deepEqual(resolveWorkOrderSort("order_no_desc"), { column: "order_no", ascending: false });
});

test("resolveWorkOrderSort：預設值是 received_desc", () => {
  assert.deepEqual(resolveWorkOrderSort(undefined), { column: "received_at", ascending: false });
});

test("resolveWorkOrderSort：非法字串一律退回預設值，不會被塞進 column", () => {
  assert.deepEqual(resolveWorkOrderSort("id; drop table work_orders;--"), {
    column: "received_at",
    ascending: false,
  });
  assert.deepEqual(resolveWorkOrderSort(""), { column: "received_at", ascending: false });
  assert.deepEqual(resolveWorkOrderSort("customer_name"), { column: "received_at", ascending: false });
});

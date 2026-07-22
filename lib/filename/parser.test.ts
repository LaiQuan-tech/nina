import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFilename } from "./parser";

const GOOD = "069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai";

test("正確檔名 → ok:true 且各欄位拆解正確", () => {
  const r = parseFilename(GOOD);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.segments.serial, "069871");
  assert.equal(r.segments.payment, "月匯");
  assert.equal(r.segments.customer, "百陽廣告");
  assert.equal(r.segments.category, "78");
  assert.equal(r.segments.date, "20260625");
  assert.equal(r.segments.owner, "WG");
  assert.equal(r.segments.design, "星雲AI地板");
  assert.equal(r.segments.sizeW, 90);
  assert.equal(r.segments.sizeH, 100);
  assert.equal(r.segments.sizeUnit, "cm");
  assert.equal(r.segments.material, "pvc+霧");
  assert.equal(r.segments.productName, "高遮PVC+霧");
  assert.equal(r.segments.totalQty, 1);
  assert.equal(r.segments.spec, "CCPVC720N10M");
  assert.equal(r.segments.ext, "ai");
});

test("5 碼流水號 → serial 錯", () => {
  const r = parseFilename("06987_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errors[0].key, "serial");
});

test("客戶區塊缺大括號 → customer 錯", () => {
  const r = parseFilename("069871_(月匯)百陽廣告_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => e.key === "customer"));
});

test("尺寸缺 cm → size 錯", () => {
  const r = parseFilename("069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100pvc+霧-1CCPVC720N10M.ai");
  assert.equal(r.ok, false);
  if (r.ok) return;
  // design 用 lookahead 找尺寸；沒有合法尺寸時會停在 design 或 size，兩者皆屬尺寸相關
  assert.ok(r.errors.some((e) => e.key === "design" || e.key === "size"));
});

test("不允許的副檔名 → ext 錯", () => {
  const r = parseFilename("069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.docx");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => e.key === "ext"));
});

test("底線段數不對 → layout 錯", () => {
  const r = parseFilename("069871-{(月匯)百陽廣告}-(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.errors[0].key, "layout");
});

test("缺數量段 → totalQty 錯", () => {
  const r = parseFilename("069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧CCPVC720N10M.ai");
  assert.equal(r.ok, false);
  if (r.ok) return;
  // material 用 lookahead 找 -數量；沒有 -數量時 material 或 totalQty 會回報
  assert.ok(r.errors.some((e) => e.key === "material" || e.key === "totalQty"));
});

test("空字串 → 不 crash，回 ok:false", () => {
  const r = parseFilename("");
  assert.equal(r.ok, false);
});

test("材質查無對照 → 仍 ok，productName 原樣", () => {
  const r = parseFilename("069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cm帆布-1CCPVC720N10M.ai");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.segments.material, "帆布");
  assert.equal(r.segments.productName, "帆布");
});

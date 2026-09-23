import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveLamination,
  deriveInkType,
  derivePrintMethod,
  derivePlateMaterial,
  INK_WHITELIST,
} from "./productName";

// ── deriveLamination ──────────────────────────────────────────────
test("deriveLamination: name 命中「霧」（真實 ERP 範例 CCPVC720N）", () => {
  const r = deriveLamination("高遮PVC+霧", "CCPVC720N");
  assert.deepEqual(r, { value: "霧", source: "erp_name", confidence: "high" });
});

test("deriveLamination: name 命中「細霧」優先於「霧」（長詞先比）", () => {
  const r = deriveLamination("高遮PVC+細霧", "CCPVC720NN");
  assert.deepEqual(r, { value: "細霧", source: "erp_name", confidence: "high" });
});

test("deriveLamination: name 命中「亮」", () => {
  const r = deriveLamination("高遮PVC+亮", "CCPVC720L");
  assert.deepEqual(r, { value: "亮", source: "erp_name", confidence: "high" });
});

test("deriveLamination: name 無護貝字樣 → fallback 看 code 尾碼 N（medium）", () => {
  const r = deriveLamination("某商品規格描述", "AB1234N");
  assert.deepEqual(r, { value: "霧", source: "erp_code_suffix", confidence: "medium" });
});

test("deriveLamination: code 尾碼 NN → 細霧", () => {
  const r = deriveLamination("某商品規格描述", "AB1234NN");
  assert.deepEqual(r, { value: "細霧", source: "erp_code_suffix", confidence: "medium" });
});

test("deriveLamination: code 尾碼 L → 亮", () => {
  const r = deriveLamination("某商品規格描述", "AB1234L");
  assert.deepEqual(r, { value: "亮", source: "erp_code_suffix", confidence: "medium" });
});

test("deriveLamination: name 與 code 尾碼衝突時 name 勝", () => {
  // name 明講「亮」，code 尾碼卻是 N（照後綴規則會是「霧」）——name 優先。
  const r = deriveLamination("測試商品+亮", "TESTN");
  assert.deepEqual(r, { value: "亮", source: "erp_name", confidence: "high" });
});

test("deriveLamination: 跳過含「不含/無/自備」的段，且 code 尾碼也配不上 → null", () => {
  const r = deriveLamination("不含亮膜+PVC平板", "XX0001");
  assert.equal(r, null);
});

test("deriveLamination: 完全掃不到 → null（絕不亂猜）", () => {
  const r = deriveLamination("純文字描述沒有相關字樣", "ZZ9999Q");
  assert.equal(r, null);
});

// ── deriveInkType ─────────────────────────────────────────────────
test("deriveInkType: 白名單命中（真實 ERP 範例：CCPVC720N 對到戶外油性輸出）", () => {
  const r = deriveInkType("戶外油性輸出");
  assert.deepEqual(r, { value: "戶外油性輸出", source: "erp_sub_name", confidence: "high" });
});

test("deriveInkType: 白名單涵蓋全部 5 個值", () => {
  for (const name of INK_WHITELIST) {
    const r = deriveInkType(name);
    assert.equal(r?.value, name);
    assert.equal(r?.confidence, "high");
  }
});

test("deriveInkType: 不在白名單（例：子分類名稱「一般帆布」）→ null，絕不誤寫", () => {
  assert.equal(deriveInkType("一般帆布"), null);
});

test("deriveInkType: sub_name 是 null/空字串 → null", () => {
  assert.equal(deriveInkType(null), null);
  assert.equal(deriveInkType(""), null);
  assert.equal(deriveInkType(undefined), null);
});

// ── derivePrintMethod ─────────────────────────────────────────────
test("derivePrintMethod: 單一命中 + dpi 附加", () => {
  const r = derivePrintMethod("軟材雙噴720dpi(可噴白墨)");
  assert.equal(r?.value, "雙噴 720dpi");
  assert.equal(r?.confidence, "medium");
});

test("derivePrintMethod: 同名稱內 UV直噴 與 直噴 視為同一種（不算 2 種命中）", () => {
  const r = derivePrintMethod("軟材UV直噴(整捲，可噴白墨)");
  assert.equal(r?.value, "UV直噴");
});

test("derivePrintMethod: 單一命中無 dpi", () => {
  const r = derivePrintMethod("網版印刷代工(自備材料)");
  assert.equal(r?.value, "網版印刷");
});

test("derivePrintMethod: 零命中 → null", () => {
  assert.equal(derivePrintMethod("高遮PVC+霧"), null);
});

test("derivePrintMethod: ≥2 種命中 → null（避免瞎猜）", () => {
  assert.equal(derivePrintMethod("熱昇華轉印布類"), null);
});

// ── derivePlateMaterial ───────────────────────────────────────────
test("derivePlateMaterial: 命中並保留厚度（真實 ERP 範例 5mm豪卡板）", () => {
  const r = derivePlateMaterial("高遮PVC+亮+5mm豪卡板");
  assert.deepEqual(r, { value: "5mm豪卡板", source: "erp_name", confidence: "medium" });
});

test("derivePlateMaterial: 正規化 1CM → 1cm", () => {
  const r = derivePlateMaterial("EPSON+PVC+亮+1CM合成板");
  assert.equal(r?.value, "1cm合成板");
});

test("derivePlateMaterial: 正規化 合成版 → 合成板（真實 ERP 錯別字範例）", () => {
  const r = derivePlateMaterial("EPSON+PVC+細霧+合成版");
  assert.equal(r?.value, "合成板");
});

test("derivePlateMaterial: index=0 的段不接受（真實 ERP 範例：材質段在最前面）", () => {
  const r = derivePlateMaterial("1CM合成板+電腦割型");
  assert.equal(r, null);
});

test("derivePlateMaterial: 含括號的段跳過（真實 ERP 範例）", () => {
  const r = derivePlateMaterial("EPSON+(3M)PVC+合成板");
  // index1 "(3M)PVC" 含括號跳過，index2 "合成板" 才命中
  assert.equal(r?.value, "合成板");
});

test("derivePlateMaterial: 段落含括號且是唯一候選 → null", () => {
  const r = derivePlateMaterial("EPSON+高遮蔽PVC(不含冷裱)");
  assert.equal(r, null);
});

test("derivePlateMaterial: 段落過長（>12 字，真實 ERP 範例）→ 跳過不誤判", () => {
  const r = derivePlateMaterial("軟性磁鐵+高遮蔽PVC_720dpi(含亮膜)");
  assert.equal(r, null);
});

test("derivePlateMaterial: 掃不到任何版材關鍵字 → null", () => {
  assert.equal(derivePlateMaterial("高遮PVC+霧"), null);
});

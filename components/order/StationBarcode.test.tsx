import assert from "node:assert/strict";
import test from "node:test";
// 這個測試檔本身也用 JSX（<StationBarcode .../>），跟元件檔一樣需要顯式 import React
// 才能在 `tsx` CLI 的 classic JSX transform 下執行，見 StationBarcode.tsx 開頭註解。
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StationBarcode from "./StationBarcode";

test("StationBarcode：合法 order_no → 渲染出 <svg> 與 caption 文字", () => {
  const html = renderToStaticMarkup(<StationBarcode orderNo="CK1150923-0001" station="output" />);
  assert.match(html, /<svg/);
  assert.match(html, /CK1150923-0001/);
  assert.match(html, /輸出/);
});

test("StationBarcode：order_no 格式不符（encodeBarcode 回 null）→ 印「條碼不可用」，不 throw", () => {
  const html = renderToStaticMarkup(<StationBarcode orderNo="bad-order-no" station="output" />);
  assert.match(html, /條碼不可用/);
  assert.doesNotMatch(html, /<svg/);
});

test("StationBarcode：output 站別條碼高度縮成 10mm", () => {
  const html = renderToStaticMarkup(<StationBarcode orderNo="CK1150923-0001" station="output" />);
  assert.match(html, /height="10mm"/);
});

test("StationBarcode：非 output 站別（例如 delivered）維持預設 18mm 高度", () => {
  const html = renderToStaticMarkup(<StationBarcode orderNo="CK1150923-0001" station="delivered" />);
  assert.match(html, /<svg/);
  assert.match(html, /height="18mm"/);
  assert.match(html, /送貨簽收/);
});

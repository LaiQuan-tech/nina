import assert from "node:assert/strict";
import test from "node:test";
// 跟 StationBarcode.test.tsx 一樣：tsx 的 classic JSX transform 需要顯式 import React。
import React from "react";
import { renderToString } from "react-dom/server";
import { itemOptionLabel } from "./itemOptionLabel";

test("itemOptionLabel：代碼、空白、名稱、全形括號單位——與改版前 JSX 拼出的文字逐字相同", () => {
  assert.equal(itemOptionLabel({ code: "ZA0024", name: "裁切", unit: "才" }), "ZA0024 裁切（才）");
  assert.equal(itemOptionLabel({ code: "ZE0001", name: "運費", unit: null }), "ZE0001 運費");
  assert.equal(itemOptionLabel({ code: "ZE0001", name: "運費", unit: "" }), "ZE0001 運費");
});

test("itemOptionLabel：SSR 成單一文字節點，option 內不再有 <!-- --> 分隔", () => {
  const opt = { code: "ZA0024", name: "裁切", unit: "才" };
  const html = renderToString(
    <select value="ZA0024" onChange={() => undefined}>
      <option value={opt.code}>{itemOptionLabel(opt)}</option>
    </select>
  );
  assert.match(html, /<option value="ZA0024" selected="">ZA0024 裁切（才）<\/option>/);
  assert.doesNotMatch(html, /<!-- -->/);
  // 對照組：改版前的寫法會被拆成多個文字節點
  const legacy = renderToString(
    <select value="ZA0024" onChange={() => undefined}>
      <option value={opt.code}>
        {opt.code} {opt.name}
        {opt.unit ? `（${opt.unit}）` : ""}
      </option>
    </select>
  );
  assert.match(legacy, /<!-- -->/);
});

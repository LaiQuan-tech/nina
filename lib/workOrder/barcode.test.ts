import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeBarcode,
  decodeBarcode,
  code128cChecksum,
  code128cModules,
  code128cSvg,
} from "./barcode";
import type { StationKey } from "./barcode";

test("encodeBarcode: output 站別 → payload/caption 正確", () => {
  const r = encodeBarcode("CK1150923-0001", "output");
  assert.ok(r);
  assert.equal(r!.payload, "115092300011");
  assert.equal(r!.caption, "CK1150923-0001 · 輸出");
});

test("encodeBarcode: delivered 站別 → payload 正確", () => {
  const r = encodeBarcode("CK1150923-0042", "delivered");
  assert.ok(r);
  assert.equal(r!.payload, "115092300425");
});

test("encodeBarcode: order_no 格式不符 → null", () => {
  assert.equal(encodeBarcode("bad", "output"), null);
});

test("encodeBarcode: 序號破 9999（變 5 碼）的不合法 order_no → null", () => {
  assert.equal(encodeBarcode("CK1150923-10000", "output"), null);
});

test("encode∘decode 往返：5 個站別都能還原原始 orderNo 與 station", () => {
  const orderNo = "CK1150923-0007";
  const stations: StationKey[] = ["output", "process", "accessory", "packed", "delivered"];
  for (const station of stations) {
    const enc = encodeBarcode(orderNo, station);
    assert.ok(enc, `station=${station} 應可編碼`);
    const dec = decodeBarcode(enc!.payload);
    assert.ok(dec, `station=${station} 應可解碼`);
    assert.equal(dec!.orderNo, orderNo);
    assert.equal(dec!.station, station);
  }
});

test("decodeBarcode: 正常 payload 解回 orderNo + station", () => {
  const r = decodeBarcode("115092300011");
  assert.ok(r);
  assert.equal(r!.orderNo, "CK1150923-0001");
  assert.equal(r!.station, "output");
});

test("decodeBarcode: 站別碼 9（不在 1..5）→ null", () => {
  assert.equal(decodeBarcode("115092300019"), null);
});

test("decodeBarcode: 非 12 碼數字 → null", () => {
  assert.equal(decodeBarcode("abc"), null);
});

test("code128cChecksum: 手算驗證（payload 115092300011 拆出的 6 組配對值）", () => {
  // pairs = [11, 50, 92, 30, 0, 11]（"11","50","92","30","00","11"）
  // checksum = (105 + 11*1 + 50*2 + 92*3 + 30*4 + 0*5 + 11*6) mod 103
  //          = (105 + 11 + 100 + 276 + 120 + 0 + 66) mod 103
  //          = 678 mod 103 = 60
  assert.equal(code128cChecksum([11, 50, 92, 30, 0, 11]), 60);
});

test("code128cModules: 寬度總和（不含 quiet zone）＝ 101", () => {
  // 8 個一般 symbol（Start + 6 組資料 + checksum）× 11 + Stop 13 = 101
  const modules = code128cModules("115092300011");
  const sum = modules.reduce((a, b) => a + b, 0);
  assert.equal(sum, 101);
});

test("code128cSvg: 回傳合法 inline SVG（crispEdges + 至少一個 rect）", () => {
  const svg = code128cSvg("115092300011");
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
  assert.ok(svg.includes("<rect"));
});

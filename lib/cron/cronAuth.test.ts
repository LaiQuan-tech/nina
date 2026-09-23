import assert from "node:assert/strict";
import test from "node:test";
import { isValidCronSecret } from "./cronAuth";

test("isValidCronSecret：沒帶 Authorization header 一律拒絕", () => {
  assert.equal(isValidCronSecret(null, "s3cret"), false);
  assert.equal(isValidCronSecret(undefined, "s3cret"), false);
});

test("isValidCronSecret：帶錯 secret 一律拒絕", () => {
  assert.equal(isValidCronSecret("Bearer wrong", "s3cret"), false);
  assert.equal(isValidCronSecret("s3cret", "s3cret"), false); // 少了 "Bearer " 前綴也不算
});

test("isValidCronSecret：secret 正確才通過", () => {
  assert.equal(isValidCronSecret("Bearer s3cret", "s3cret"), true);
});

test("isValidCronSecret：CRON_SECRET 這個環境變數沒設定時，無論帶什麼一律拒絕（fail-closed）", () => {
  assert.equal(isValidCronSecret("Bearer undefined", undefined), false);
  assert.equal(isValidCronSecret("Bearer ", undefined), false);
  assert.equal(isValidCronSecret(null, undefined), false);
  assert.equal(isValidCronSecret("Bearer ", ""), false);
});

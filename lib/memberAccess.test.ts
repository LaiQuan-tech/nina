import assert from "node:assert/strict";
import test from "node:test";
import { isFrontMemberEligible } from "./members";

test("正式會員可使用前台會員流程", () => {
  assert.equal(isFrontMemberEligible({ is_demo: false }), true);
});

test("Demo 會員不得登入或出現在前台會員流程", () => {
  assert.equal(isFrontMemberEligible({ is_demo: true }), false);
});

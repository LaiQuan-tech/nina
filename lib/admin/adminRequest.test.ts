import assert from "node:assert/strict";
import test from "node:test";
import { hasSameAdminOrigin } from "./adminRequest";

test("管理後台寫入請求必須明確帶同源 Origin", () => {
  assert.equal(hasSameAdminOrigin(new Request("https://nina.example/api/admin/assistant", { method: "POST" })), false);
  assert.equal(
    hasSameAdminOrigin(
      new Request("https://nina.example/api/admin/assistant", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      }),
    ),
    false,
  );
  assert.equal(
    hasSameAdminOrigin(
      new Request("https://nina.example/api/admin/assistant", {
        method: "POST",
        headers: { Origin: "https://nina.example" },
      }),
    ),
    true,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  canWriteProductionSession,
  productionSessionFilter,
} from "./intakeSessions";
import { productionWorkOrderFilter } from "./workOrders";

test("正式收稿案件查詢固定排除 Demo 資料", () => {
  assert.deepEqual(productionSessionFilter(), {
    column: "is_demo",
    value: false,
  });
});

test("正式案件工單查詢固定排除 Demo 資料", () => {
  assert.deepEqual(productionWorkOrderFilter(), {
    column: "is_demo",
    value: false,
  });
});

test("production writer 對 Demo 或 session 查詢失敗時 fail-closed", () => {
  assert.equal(canWriteProductionSession(null, null), true);
  assert.equal(canWriteProductionSession({ is_demo: false }, null), true);
  assert.equal(canWriteProductionSession({ is_demo: true }, null), false);
  assert.equal(canWriteProductionSession(null, new Error("lookup failed")), false);
});

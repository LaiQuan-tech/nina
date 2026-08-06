import assert from "node:assert/strict";
import test from "node:test";
import { isWorkOrderReadOnly } from "./workOrders";

test("Demo 工單一律視為唯讀", () => {
  assert.equal(isWorkOrderReadOnly({ is_demo: true }), true);
  assert.equal(isWorkOrderReadOnly({ is_demo: false }), false);
});

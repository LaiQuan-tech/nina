import assert from "node:assert/strict";
import test from "node:test";
import { isWorkOrderReadOnly, splitWorkOrderItems, type WorkOrderItem } from "./workOrders";

test("Demo 工單一律視為唯讀", () => {
  assert.equal(isWorkOrderReadOnly({ is_demo: true }), true);
  assert.equal(isWorkOrderReadOnly({ is_demo: false }), false);
});

function item(id: string, kind: "processing" | "accessory", sort: number): WorkOrderItem {
  return { id, work_order_id: "o1", kind, sort, code: null, name: id, qty: null, unit: null, created_at: "2026-09-28T00:00:00Z" };
}

test("splitWorkOrderItems：一次查回的明細依 kind 拆兩組，各自保持原順序", () => {
  const rows = [item("p1", "processing", 0), item("a1", "accessory", 0), item("p2", "processing", 1), item("a2", "accessory", 1)];
  const { processing, accessory } = splitWorkOrderItems(rows);
  assert.deepEqual(processing.map((r) => r.id), ["p1", "p2"]);
  assert.deepEqual(accessory.map((r) => r.id), ["a1", "a2"]);
});

test("splitWorkOrderItems：空陣列 → 兩組都空", () => {
  assert.deepEqual(splitWorkOrderItems([]), { processing: [], accessory: [] });
});

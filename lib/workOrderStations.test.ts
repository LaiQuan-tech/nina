import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveOrderProgress } from "./workOrderStations";
import type { StationKey } from "./workOrder/barcode";

test("空陣列 → status open, station null", () => {
  const r = deriveOrderProgress([]);
  assert.equal(r.status, "open");
  assert.equal(r.station, null);
});

test("單筆 output → in_progress / output", () => {
  const r = deriveOrderProgress([{ station: "output", scanned_at: "2026-09-01T00:00:00Z" }]);
  assert.equal(r.status, "in_progress");
  assert.equal(r.station, "output");
});

test("亂序多筆 → 取 scanned_at 最新那筆的 station", () => {
  const events: { station: StationKey; scanned_at: string }[] = [
    { station: "packed", scanned_at: "2026-09-03T08:00:00Z" },
    { station: "output", scanned_at: "2026-09-01T08:00:00Z" },
    { station: "process", scanned_at: "2026-09-05T08:00:00Z" }, // 最新
    { station: "accessory", scanned_at: "2026-09-02T08:00:00Z" },
  ];
  const r = deriveOrderProgress(events);
  assert.equal(r.station, "process");
  assert.equal(r.status, "in_progress");
});

test("含 delivered（非最新一筆）→ status 仍 done，但 station 取最新那筆（不對稱）", () => {
  const events: { station: StationKey; scanned_at: string }[] = [
    { station: "delivered", scanned_at: "2026-09-01T08:00:00Z" }, // 最舊，但存在 delivered
    { station: "process", scanned_at: "2026-09-05T08:00:00Z" }, // 最新
  ];
  const r = deriveOrderProgress(events);
  assert.equal(r.status, "done"); // 任一筆是 delivered，status 就是 done
  assert.equal(r.station, "process"); // station 仍是「最新掃到」那筆，不是 delivered
});

test("不 mutate 傳入陣列", () => {
  const events: { station: StationKey; scanned_at: string }[] = [
    { station: "output", scanned_at: "2026-09-01T08:00:00Z" },
    { station: "packed", scanned_at: "2026-09-02T08:00:00Z" },
  ];
  const snapshot = JSON.parse(JSON.stringify(events));
  deriveOrderProgress(events);
  assert.deepEqual(events, snapshot);
});

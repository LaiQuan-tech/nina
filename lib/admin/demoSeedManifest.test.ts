import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoSeed } from "./demoSeedManifest";

const seed = buildDemoSeed(new Date("2026-08-06T04:00:00Z"));

test("Demo manifest 有 10 位唯一的虛構客戶", () => {
  assert.equal(seed.members.length, 10);
  assert.equal(new Set(seed.members.map((row) => row.id)).size, 10);
  assert.equal(new Set(seed.members.map((row) => row.phone)).size, 10);
  assert.equal(new Set(seed.members.map((row) => row.email)).size, 10);
  assert.equal(seed.members.every((row) => /^09000000\d{2}$/.test(row.phone)), true);
  assert.equal(seed.members.every((row) => row.email.endsWith("@example.com")), true);
});

test("Demo manifest 資料量足以展示各種服務情境", () => {
  assert.equal(seed.profiles.length, 10);
  assert.equal(seed.sessions.length >= 20, true);
  assert.equal(seed.quotes.length >= 15, true);
  assert.equal(seed.orders.length >= 30, true);
  assert.equal(seed.followups.length >= 12, true);
});

test("所有關聯都指向存在的 Demo member", () => {
  const memberIds = new Set(seed.members.map((row) => row.id));
  for (const collection of [seed.profiles, seed.sessions, seed.quotes, seed.orders, seed.followups]) {
    assert.equal(collection.every((row) => memberIds.has(row.member_id)), true);
  }
});

test("每一筆 seed 資料都有 is_demo=true", () => {
  for (const collection of Object.values(seed)) {
    assert.equal(collection.every((row) => row.is_demo === true), true);
  }
});

test("回訪同時包含逾期、今天與未來情境", () => {
  const due = seed.followups.map((row) => new Date(row.due_at).getTime());
  const now = new Date("2026-08-06T04:00:00Z").getTime();
  assert.equal(due.some((time) => time < now - 12 * 60 * 60 * 1000), true);
  assert.equal(due.some((time) => Math.abs(time - now) < 12 * 60 * 60 * 1000), true);
  assert.equal(due.some((time) => time > now + 24 * 60 * 60 * 1000), true);
});

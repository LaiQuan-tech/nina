import assert from "node:assert/strict";
import test from "node:test";
import { createSerialQueue } from "./serial";

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

test("createSerialQueue：同時丟 20 個 task，任何時刻只有一個在跑、照呼叫順序完成", async () => {
  const run = createSerialQueue();
  let running = 0;
  let peak = 0;
  const order: number[] = [];
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      run(async () => {
        running++;
        peak = Math.max(peak, running);
        await tick(Math.random() * 3);
        order.push(i);
        running--;
        return i * 2;
      })
    )
  );
  assert.equal(peak, 1);
  assert.deepEqual(order, Array.from({ length: 20 }, (_, i) => i));
  assert.deepEqual(results, Array.from({ length: 20 }, (_, i) => i * 2));
});

test("createSerialQueue：前一個 task 失敗（含同步 throw）只回給它自己，後面的照常執行", async () => {
  const run = createSerialQueue();
  const a = run(async () => {
    throw new Error("boom");
  });
  const b = run((() => {
    throw new Error("sync boom");
  }) as () => Promise<never>);
  const c = run(async () => "ok");
  await assert.rejects(a, /boom/);
  await assert.rejects(b, /sync boom/);
  assert.equal(await c, "ok");
});

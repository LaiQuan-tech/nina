import assert from "node:assert/strict";
import test from "node:test";
import { summarizeUploadBatch } from "./completion";

test("全部成功時回傳成功數量", () => {
  assert.deepEqual(summarizeUploadBatch([true, true]), {
    successCount: 2,
    failureCount: 0,
    canFinish: true,
  });
});

test("部分成功時分開計數", () => {
  assert.deepEqual(summarizeUploadBatch([true, false, false]), {
    successCount: 1,
    failureCount: 2,
    canFinish: true,
  });
});

test("全部失敗時不可完成送件", () => {
  assert.deepEqual(summarizeUploadBatch([false, false]), {
    successCount: 0,
    failureCount: 2,
    canFinish: false,
  });
});

test("空批次不可完成送件", () => {
  assert.deepEqual(summarizeUploadBatch([]), {
    successCount: 0,
    failureCount: 0,
    canFinish: false,
  });
});

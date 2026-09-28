import assert from "node:assert/strict";
import test from "node:test";
import { THUMBNAIL_LEASE_MS, THUMBNAIL_MAX_TRIES } from "./policy";
import {
  nextThumbnailClientStep,
  thumbnailGenerateResponse,
  thumbnailPollDelayMs,
  THUMBNAIL_POLL_BUDGET_MS,
  THUMBNAIL_POLL_MAX_DELAY_MS,
  THUMBNAIL_REFRESH_GRACE_MS,
} from "./response";

const row = (over: Record<string, unknown> = {}) => ({
  thumbnail_path: null,
  thumbnail_status: "pending",
  thumbnail_meta: {},
  ...over,
});

test("端點回應：成功 → hasThumbnail；別人正在產 → inProgress；不支援／次數用完 → retryable=false", () => {
  assert.deepEqual(
    thumbnailGenerateResponse({ row: row({ thumbnail_path: "thumbs/a-auto-x.jpg", thumbnail_status: "ok" }), inProgress: false, confirmed: true }),
    { ok: true, status: "ok", hasThumbnail: true, inProgress: false, retryable: false, reason: null }
  );
  assert.equal(thumbnailGenerateResponse({ row: row(), inProgress: true, confirmed: true }).inProgress, true);
  const tooLarge = thumbnailGenerateResponse({
    row: row({ thumbnail_status: "unsupported", thumbnail_meta: { reason: "too_large" } }),
    inProgress: false,
    confirmed: true,
  });
  assert.deepEqual([tooLarge.retryable, tooLarge.reason], [false, "too_large"]);
  const exhausted = thumbnailGenerateResponse({ row: row({ thumbnail_status: "failed", thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES } }), inProgress: false, confirmed: true });
  assert.equal(exhausted.retryable, false);
});

test("端點回應：寫回／重讀 DB 失敗（confirmed=false）→ 一律「沒有縮圖、可重試」，不回報本地推測的結果", () => {
  const body = thumbnailGenerateResponse({ row: row({ thumbnail_path: "thumbs/local-guess.jpg", thumbnail_status: "ok" }), inProgress: false, confirmed: false });
  assert.deepEqual([body.hasThumbnail, body.retryable, body.inProgress, body.status], [false, true, false, null]);
});

test("端點回應不含 storage 路徑與 last_error", () => {
  const body = thumbnailGenerateResponse({
    row: row({ thumbnail_path: "thumbs/secret.jpg", thumbnail_status: "failed", thumbnail_meta: { last_error: "boom", tries: 1 } }),
    inProgress: false,
    confirmed: true,
  });
  assert.ok(!JSON.stringify(body).includes("secret"));
  assert.ok(!JSON.stringify(body).includes("boom"));
});

test("前端下一步：有圖／確定不會再產 → refresh；別人正在產 → wait；可重試的失敗、HTTP 錯誤、回應壞掉 → failed", () => {
  assert.equal(nextThumbnailClientStep(true, { ok: true, hasThumbnail: true, retryable: false }), "refresh");
  assert.equal(nextThumbnailClientStep(true, { ok: true, hasThumbnail: false, inProgress: false, retryable: false }), "refresh");
  assert.equal(nextThumbnailClientStep(true, { ok: true, hasThumbnail: false, inProgress: true, retryable: true }), "wait");
  assert.equal(nextThumbnailClientStep(true, { ok: true, hasThumbnail: false, inProgress: true, retryable: false }), "wait");
  assert.equal(nextThumbnailClientStep(true, { ok: true, hasThumbnail: false, inProgress: false, retryable: true }), "failed");
  assert.equal(nextThumbnailClientStep(false, { ok: false, error: "unauthorized" }), "failed");
  assert.equal(nextThumbnailClientStep(true, null), "failed");
  assert.equal(nextThumbnailClientStep(true, "garbage"), "failed");
});

test("前端輪詢：退避 2→3→5→8→10 秒封頂；一輪的時間上限長於租約（持有人被砍掉時，租約過期後還輪得到自己接手）", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 50].map(thumbnailPollDelayMs), [2000, 3000, 5000, 8000, 10000, 10000, 10000]);
  assert.equal(THUMBNAIL_POLL_MAX_DELAY_MS, 10_000);
  assert.ok(THUMBNAIL_POLL_BUDGET_MS >= THUMBNAIL_LEASE_MS + THUMBNAIL_POLL_MAX_DELAY_MS);
  // 模擬一直「別人正在產」：有上限、不會無限輪詢
  let elapsed = 0;
  let polls = 0;
  for (let i = 0; ; i++) {
    const delay = thumbnailPollDelayMs(i);
    if (elapsed + delay > THUMBNAIL_POLL_BUDGET_MS) break;
    elapsed += delay;
    polls++;
  }
  assert.ok(polls > 0 && polls < 20, `polls=${polls}`);
  assert.ok(THUMBNAIL_REFRESH_GRACE_MS < THUMBNAIL_POLL_BUDGET_MS);
});

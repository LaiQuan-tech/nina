import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  autoThumbnailPath,
  buildThumbnailClaimMeta,
  canAutoGenerateThumbnail,
  canClaimThumbnail,
  computePdfRenderSize,
  isThumbnailInProgress,
  isThumbnailRetryable,
  isThumbnailSourceTooLarge,
  releaseThumbnailLease,
  thumbnailLeaseActive,
  thumbnailPlaceholderKind,
  thumbnailTries,
  truncateThumbnailError,
  THUMBNAIL_LEASE_MS,
  THUMBNAIL_MAX_SOURCE_BYTES,
  THUMBNAIL_MAX_TRIES,
} from "./policy";

const base = { thumbnail_path: null, thumbnail_status: "pending", thumbnail_meta: {} };

test("縮圖規則：pending、舊單 null、failed 未滿重試上限 → 可以自動產", () => {
  assert.equal(canAutoGenerateThumbnail(base), true);
  assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_status: null }), true);
  assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_status: "failed", thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES - 1 } }), true);
});

test("縮圖規則：已有縮圖（含人工補的 -manual- 圖）→ 不產", () => {
  assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_path: "thumbs/x.jpg", thumbnail_status: "ok" }), false);
  assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_path: "thumbs/x-manual-thumbnail-1.jpg", thumbnail_status: "pending" }), false);
});

test("縮圖規則：終態 ok／unsupported（含 too_large）／manual → 不產", () => {
  for (const status of ["ok", "unsupported", "manual"]) {
    assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_status: status }), false, status);
  }
  assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_status: "unsupported", thumbnail_meta: { reason: "too_large" } }), false);
});

test("縮圖規則：failed 滿 3 次就不再自動重試（不會每次開頁都重跑）", () => {
  assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_status: "failed", thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES } }), false);
  assert.equal(canAutoGenerateThumbnail({ ...base, thumbnail_status: "failed", thumbnail_meta: { tries: 9 } }), false);
});

test("thumbnailTries：只認正數，缺值／亂值一律當 0", () => {
  assert.equal(thumbnailTries({ tries: 2 }), 2);
  assert.equal(thumbnailTries({}), 0);
  assert.equal(thumbnailTries(null), 0);
  assert.equal(thumbnailTries({ tries: "3" }), 0);
  assert.equal(thumbnailTries({ tries: -1 }), 0);
  assert.equal(thumbnailTries([1, 2]), 0);
});

test("isThumbnailSourceTooLarge：>25MB 才算，剛好 25MB 不算；大小未知（null）交給下載後再判斷", () => {
  assert.equal(isThumbnailSourceTooLarge(THUMBNAIL_MAX_SOURCE_BYTES + 1), true);
  assert.equal(isThumbnailSourceTooLarge(THUMBNAIL_MAX_SOURCE_BYTES), false);
  assert.equal(isThumbnailSourceTooLarge(767_532), false);
  assert.equal(isThumbnailSourceTooLarge(null), false);
  assert.equal(isThumbnailSourceTooLarge(undefined), false);
  assert.equal(isThumbnailSourceTooLarge(Number.NaN), false);
});

test("computePdfRenderSize：A4 直式（595×842pt）→ 長邊 1200、比例不變", () => {
  const size = computePdfRenderSize(595.28, 841.89);
  assert.ok(size);
  assert.equal(size.height, 1200);
  assert.equal(size.width, 848);
});

test("computePdfRenderSize：90×180cm 布條（2551×5102pt）直接渲到 600×1200，不再先渲出上百 MB 的點陣", () => {
  const size = computePdfRenderSize(2551.18, 5102.36);
  assert.ok(size);
  assert.deepEqual([size.width, size.height], [600, 1200]);
  // 舊版固定 scale=2：5102×10204 RGBA ≈ 208MB；新版 600×1200 RGBA ≈ 2.9MB
  assert.ok(size.width * size.height * 4 < 3 * 1024 * 1024);
});

test("computePdfRenderSize：橫式大圖也是長邊 1200", () => {
  const size = computePdfRenderSize(8503.94, 2834.65); // 300×100cm
  assert.ok(size);
  assert.deepEqual([size.width, size.height], [1200, 400]);
});

test("computePdfRenderSize：小頁面放大倍率夾在 2（跟舊版 scale=2 一樣大，不為了湊 1200 放大）", () => {
  const size = computePdfRenderSize(255.12, 155.91); // 9×5.5cm 名片
  assert.ok(size);
  assert.equal(size.scale, 2);
  assert.deepEqual([size.width, size.height], [510, 312]);
});

test("computePdfRenderSize：尺寸無效 → null（呼叫端標 unsupported）", () => {
  assert.equal(computePdfRenderSize(0, 842), null);
  assert.equal(computePdfRenderSize(-1, 842), null);
  assert.equal(computePdfRenderSize(Number.NaN, 842), null);
  assert.equal(computePdfRenderSize(595, Number.POSITIVE_INFINITY), null);
});

// ── 產圖租約（必修1／應修1）──────────────────────────────────────────────
const NOW = Date.parse("2026-09-29T00:00:00.000Z");
const leaseUntil = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

test("開工次數滿上限就不再自動跑，不管狀態是 pending 還是 failed（被平台砍掉的嘗試不會留在 pending 無限重跑）", () => {
  const exhausted = { tries: THUMBNAIL_MAX_TRIES };
  for (const status of ["pending", "failed", null]) {
    const order = { ...base, thumbnail_status: status, thumbnail_meta: exhausted };
    assert.equal(canAutoGenerateThumbnail(order, NOW), false, String(status));
    assert.equal(canClaimThumbnail(order, NOW), false, String(status));
    assert.equal(isThumbnailRetryable(order), false, String(status));
  }
});

test("租約期限內：不能再搶（別人正在產），但仍算「會產」→ 工單頁照樣掛元件等結果（含最後一次嘗試）", () => {
  const leased = { ...base, thumbnail_meta: { tries: 1, lease_until: leaseUntil(30_000), lease_id: "x" } };
  assert.equal(canClaimThumbnail(leased, NOW), false);
  assert.equal(isThumbnailInProgress(leased, NOW), true);
  assert.equal(canAutoGenerateThumbnail(leased, NOW), true);
  const lastTry = { ...base, thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES, lease_until: leaseUntil(30_000) } };
  assert.equal(canClaimThumbnail(lastTry, NOW), false);
  assert.equal(canAutoGenerateThumbnail(lastTry, NOW), true);
  assert.equal(isThumbnailRetryable(lastTry), false);
});

test("租約過期（持有人被平台砍掉）→ 可以重搶；剛好到期那一刻就算過期", () => {
  const expired = { ...base, thumbnail_meta: { tries: 1, lease_until: leaseUntil(-1), lease_id: "x" } };
  assert.equal(canClaimThumbnail(expired, NOW), true);
  assert.equal(isThumbnailInProgress(expired, NOW), false);
  assert.equal(thumbnailLeaseActive({ lease_until: leaseUntil(0) }, NOW), false);
  assert.equal(thumbnailLeaseActive({ lease_until: leaseUntil(1) }, NOW), true);
});

test("thumbnailLeaseActive：缺值／格式壞掉一律當沒有租約", () => {
  for (const meta of [{}, null, { lease_until: "garbage" }, { lease_until: 123 }, [1], { lease_until: "" }]) {
    assert.equal(thumbnailLeaseActive(meta, NOW), false, JSON.stringify(meta));
  }
});

test("已有縮圖或終態時，租約殘留也不算「正在產」", () => {
  const lease = { lease_until: leaseUntil(30_000) };
  assert.equal(isThumbnailInProgress({ ...base, thumbnail_path: "thumbs/x-manual-thumbnail-1.jpg", thumbnail_status: "manual", thumbnail_meta: lease }, NOW), false);
  assert.equal(isThumbnailInProgress({ ...base, thumbnail_status: "unsupported", thumbnail_meta: lease }, NOW), false);
});

test("buildThumbnailClaimMeta：開工就 tries+1、記開工時間、掛新租約（蓋掉過期的舊租約），其餘欄位保留", () => {
  const claimed = buildThumbnailClaimMeta({ tries: 1, last_error: "download_failed", lease_id: "old", lease_until: leaseUntil(-5) }, "new", NOW);
  assert.equal(claimed.tries, 2);
  assert.equal(claimed.last_error, "download_failed");
  assert.equal(claimed.last_try_at, new Date(NOW).toISOString());
  assert.equal(claimed.lease_until, new Date(NOW + THUMBNAIL_LEASE_MS).toISOString());
  assert.equal(claimed.lease_id, "new");
  assert.equal(buildThumbnailClaimMeta(null, "a", NOW).tries, 1);
});

test("releaseThumbnailLease：只拿掉租約欄位，不動原物件", () => {
  const meta = { tries: 2, last_try_at: "t", lease_id: "a", lease_until: "u", reason: "too_large" };
  assert.deepEqual(releaseThumbnailLease(meta), { tries: 2, last_try_at: "t", reason: "too_large" });
  assert.equal(meta.lease_id, "a");
});

test("thumbnailPlaceholderKind：failed／unsupported 照狀態；pending 但次數用完又沒人在產 → 顯示失敗（不再永遠「產生中」）", () => {
  assert.equal(thumbnailPlaceholderKind({ ...base, thumbnail_status: "failed" }, NOW), "failed");
  assert.equal(thumbnailPlaceholderKind({ ...base, thumbnail_status: "unsupported" }, NOW), "unsupported");
  assert.equal(thumbnailPlaceholderKind({ ...base, thumbnail_status: "pending" }, NOW), "pending");
  assert.equal(thumbnailPlaceholderKind({ ...base, thumbnail_status: "pending", thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES } }, NOW), "failed");
  assert.equal(
    thumbnailPlaceholderKind({ ...base, thumbnail_status: "pending", thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES, lease_until: leaseUntil(10_000) } }, NOW),
    "pending"
  );
});

test("自動縮圖路徑每次嘗試各一個，而且跟人工補圖（-manual-）不共用", () => {
  const a = autoThumbnailPath("id", "lease-a");
  assert.notEqual(a, autoThumbnailPath("id", "lease-b"));
  assert.ok(a.startsWith("thumbs/id-auto-"));
  assert.ok(!a.includes("-manual-"));
});

test("truncateThumbnailError：過長的錯誤訊息截短（它會進條件式 update 的 URL）", () => {
  assert.equal(truncateThumbnailError("short"), "short");
  const long = "x".repeat(1000);
  assert.ok(truncateThumbnailError(long).length <= 301);
});

test("租約一定要長於所有會持有租約的函式 maxDuration（產圖端點、收檔路由），否則還在跑就會被別人重搶", () => {
  for (const file of [
    "app/api/admin/order/[id]/thumbnail/generate/route.ts",
    "app/api/upload/route.ts",
    "app/api/upload/complete/route.ts",
  ]) {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    const m = src.match(/export const maxDuration = (\d+);/);
    assert.ok(m, `${file} 必須明訂 maxDuration`);
    assert.ok(THUMBNAIL_LEASE_MS > Number(m[1]) * 1000, `${file} maxDuration=${m[1]}s 不可 ≥ 租約`);
  }
});

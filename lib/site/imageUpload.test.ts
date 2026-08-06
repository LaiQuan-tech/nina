import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SITE_IMAGE_BYTES,
  buildStoragePath,
  findImageSlot,
  validateImageBytes,
} from "./imageUpload";
import { mapReadyRows } from "./siteImages";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

test("findImageSlot 只接受已定義的圖片位", () => {
  assert.equal(findImageSlot("hero.main")?.slotKey, "hero.main");
  assert.equal(findImageSlot("../../secret"), null);
});

test("validateImageBytes 接受 JPEG 並回傳安全副檔名", () => {
  assert.deepEqual(validateImageBytes(jpeg, "image/jpeg", jpeg.byteLength), {
    ok: true,
    extension: "jpg",
  });
});

test("validateImageBytes 接受 PNG 與 WebP", () => {
  assert.deepEqual(validateImageBytes(png, "image/png", png.byteLength), {
    ok: true,
    extension: "png",
  });
  assert.deepEqual(validateImageBytes(webp, "image/webp", webp.byteLength), {
    ok: true,
    extension: "webp",
  });
});

test("validateImageBytes 拒絕不支援的 MIME type", () => {
  assert.deepEqual(validateImageBytes(jpeg, "image/svg+xml", jpeg.byteLength), {
    ok: false,
    error: "unsupported_type",
  });
});

test("validateImageBytes 拒絕 MIME 與 magic bytes 不符的偽裝圖片", () => {
  assert.deepEqual(validateImageBytes(Uint8Array.from([1, 2, 3, 4]), "image/jpeg", 4), {
    ok: false,
    error: "invalid_signature",
  });
});

test("validateImageBytes 拒絕空檔與超過 8 MiB 的圖片", () => {
  assert.deepEqual(validateImageBytes(new Uint8Array(), "image/png", 0), {
    ok: false,
    error: "empty_file",
  });
  assert.deepEqual(validateImageBytes(png, "image/png", MAX_SITE_IMAGE_BYTES + 1), {
    ok: false,
    error: "too_large",
  });
});

test("buildStoragePath 產生版本化且不含使用者檔名的安全路徑", () => {
  const path = buildStoragePath("service.canvas", "webp", 1_786_000_000_000, "abc-123");
  assert.equal(path, "slots/service-canvas/1786000000000-abc123.webp");
  assert.match(path, /^[a-z0-9/-]+\.(jpg|png|webp)$/);
});

test("mapReadyRows 只映射啟用、ready 且有網址的圖片", () => {
  const images = mapReadyRows([
    {
      slot_key: "hero.main",
      public_url: "https://cdn.example/hero.webp",
      alt: "工人安裝大型帆布",
      width: 1200,
      height: 1600,
      is_active: true,
      status: "ready",
    },
    {
      slot_key: "work.1",
      public_url: "https://cdn.example/draft.webp",
      alt: "未完成圖片",
      width: null,
      height: null,
      is_active: true,
      status: "generating",
    },
    {
      slot_key: "work.2",
      public_url: "https://cdn.example/inactive.webp",
      alt: "停用圖片",
      width: 1600,
      height: 1000,
      is_active: false,
      status: "ready",
    },
  ]);

  assert.deepEqual(images, {
    "hero.main": {
      url: "https://cdn.example/hero.webp",
      alt: "工人安裝大型帆布",
      width: 1200,
      height: 1600,
    },
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { createAdminSupabase } from "./supabase";

// 攔截 globalThis.fetch，看 supabase-js 實際送出的請求帶了什麼 cache 設定（不打任何網路）。
async function captureFetchInits(run: () => Promise<unknown>): Promise<Array<{ url: string; cache: RequestCache | undefined; method: string }>> {
  const seen: Array<{ url: string; cache: RequestCache | undefined; method: string }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), cache: init?.cache, method: init?.method ?? "GET" });
    return new Response(JSON.stringify([{ id: "1" }]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
  return seen;
}

function withEnv<T>(fn: () => T): T {
  const prev = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  try {
    return fn();
  } finally {
    if (prev.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url;
    if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
  }
}

test("createAdminSupabase 預設：PostgREST 查詢與 Storage 簽名 URL（POST）都帶 cache:no-store，不進 Next Data Cache", async () => {
  const db = withEnv(() => createAdminSupabase());
  assert.ok(db);
  const seen = await captureFetchInits(async () => {
    await db.from("work_orders").select("id").eq("id", "1");
    await db.storage.from("print-files").createSignedUrl("orders/x.pdf", 600);
  });
  assert.equal(seen.length, 2);
  assert.ok(seen.some((s) => s.url.includes("/rest/v1/work_orders")));
  assert.ok(seen.some((s) => s.url.includes("/storage/v1/object/sign/") && s.method === "POST"));
  for (const s of seen) assert.equal(s.cache, "no-store", s.url);
});

test("createAdminSupabase({ allowNextCache: true })：明確允許快取時不加 no-store，交回 Next 依路由的 revalidate 決定", async () => {
  const db = withEnv(() => createAdminSupabase({ allowNextCache: true }));
  assert.ok(db);
  const seen = await captureFetchInits(async () => {
    await db.from("site_images").select("slot_key");
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].cache, undefined);
});

test("createAdminSupabase：沒設環境變數 → null（呼叫端各自 fallback）", () => {
  const prev = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(createAdminSupabase(), null);
  } finally {
    if (prev !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prev;
  }
});

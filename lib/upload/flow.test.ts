import assert from "node:assert/strict";
import test from "node:test";
import type { Segments } from "@/lib/filename/types";
import type { ProductResolution } from "@/lib/workOrders";
import {
  completeDirectUpload,
  finalizeUploadWith,
  isUniqueViolation,
  issueUploadTicket,
  normalizeContentType,
  type CompleteDeps,
  type FinalizeArgs,
  type FinalizeDeps,
  type OrderLookup,
  type TicketDeps,
} from "./flow";
import { MAX_UPLOAD_BYTES } from "./limits";
import { newPrintFilePath } from "./path";
import { deriveUploadTicketKey, signUploadTicket, UPLOAD_TICKET_TTL_MS, verifyUploadTicket, type UploadTicket } from "./ticket";
import { parseFilename } from "@/lib/filename/parser";

const NAME = "069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai";
const KEY = deriveUploadTicketKey("test-service-role-key");
const NOW = Date.UTC(2026, 8, 29, 8, 0, 0);
const silent = () => {};

// ── 1) 簽發 ──────────────────────────────────────────────────────────────────

function ticketWorld(overrides: Partial<TicketDeps> = {}) {
  const signed: string[] = [];
  const deps: TicketDeps = {
    ticketKey: KEY,
    now: () => NOW,
    newPath: (fileName) => newPrintFilePath(fileName, new Date(NOW), "abcdef0123"),
    createUploadUrl: async (path) => {
      signed.push(path);
      return `https://example.supabase.co/storage/v1/object/upload/sign/print-files/${path}?token=t`;
    },
    ...overrides,
  };
  return { deps, signed };
}

test("簽發：合法檔名與大小 → 200 { ok, uploadUrl, ticket, contentType }，票券綁定伺服器分配的路徑、檔名、大小、60 分鐘效期", async () => {
  const w = ticketWorld();
  const r = await issueUploadTicket({ fileName: NAME, size: 5_000_000, contentType: "application/postscript" }, w.deps);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.contentType, "application/postscript");
  const path = newPrintFilePath(NAME, new Date(NOW), "abcdef0123");
  assert.deepEqual(w.signed, [path]);
  assert.equal(r.body.uploadUrl, `https://example.supabase.co/storage/v1/object/upload/sign/print-files/${path}?token=t`);
  const check = verifyUploadTicket(r.body.ticket, KEY, NOW);
  assert.deepEqual(check, { ok: true, ticket: { path, fileName: NAME, size: 5_000_000, exp: NOW + UPLOAD_TICKET_TTL_MS } });
});

test("簽發：大小邊界——剛好 10MB 可；10MB+1 byte → 413 too_large，且不簽上傳網址", async () => {
  const ok = ticketWorld();
  assert.equal((await issueUploadTicket({ fileName: NAME, size: MAX_UPLOAD_BYTES }, ok.deps)).status, 200);
  assert.equal(ok.signed.length, 1);

  const big = ticketWorld();
  const r = await issueUploadTicket({ fileName: NAME, size: MAX_UPLOAD_BYTES + 1 }, big.deps);
  assert.deepEqual(r, { status: 413, body: { ok: false, error: "too_large" } });
  assert.equal(big.signed.length, 0);
});

test("簽發：伺服器重驗檔名——格式錯 → 422 bad_filename（附 parser 結果給前端引導），不簽上傳網址", async () => {
  const w = ticketWorld();
  const r = await issueUploadTicket({ fileName: "我的海報.pdf", size: 1000 }, w.deps);
  assert.equal(r.status, 422);
  assert.equal(r.body.error, "bad_filename");
  const result = r.body.result as { ok: boolean; errors: unknown[] };
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.equal(w.signed.length, 0);
});

test("簽發：副檔名不在 EXT_ALLOW（其餘格式都對）→ 422 bad_filename", async () => {
  const w = ticketWorld();
  for (const ext of ["png", "eps", "zip", "exe"]) {
    const r = await issueUploadTicket({ fileName: NAME.replace(/\.ai$/, `.${ext}`), size: 1000 }, w.deps);
    assert.equal(r.status, 422, ext);
    assert.equal(r.body.error, "bad_filename", ext);
  }
  assert.equal(w.signed.length, 0);
});

test("簽發：輸入型別不對 → 400 bad_request；0 byte → 400 empty_file", async () => {
  const w = ticketWorld();
  const bad: unknown[] = [
    null,
    "str",
    [],
    {},
    { fileName: NAME },
    { fileName: "  ", size: 10 },
    { fileName: NAME, size: "1000" },
    { fileName: NAME, size: -1 },
    { fileName: NAME, size: 1.5 },
    { fileName: NAME, size: 10, contentType: 42 },
    { fileName: "a".repeat(252) + ".pdf", size: 10 },
  ];
  for (const body of bad) {
    const r = await issueUploadTicket(body, w.deps);
    assert.deepEqual(r, { status: 400, body: { ok: false, error: "bad_request" } }, JSON.stringify(body)?.slice(0, 60));
  }
  assert.deepEqual(await issueUploadTicket({ fileName: NAME, size: 0 }, w.deps), {
    status: 400,
    body: { ok: false, error: "empty_file" },
  });
  assert.equal(w.signed.length, 0);
});

test("簽發：沒有票券金鑰 → 503；簽上傳網址失敗 → 502 storage_failed", async () => {
  assert.equal((await issueUploadTicket({ fileName: NAME, size: 10 }, ticketWorld({ ticketKey: null }).deps)).status, 503);
  const r = await issueUploadTicket({ fileName: NAME, size: 10 }, ticketWorld({ createUploadUrl: async () => null }).deps);
  assert.deepEqual(r, { status: 502, body: { ok: false, error: "storage_failed" } });
});

test("normalizeContentType：像 MIME 的轉小寫保留，其餘（空字串、帶參數、怪字元）一律 octet-stream", () => {
  assert.equal(normalizeContentType("application/pdf"), "application/pdf");
  assert.equal(normalizeContentType("Image/TIFF"), "image/tiff");
  assert.equal(normalizeContentType("image/vnd.adobe.photoshop"), "image/vnd.adobe.photoshop");
  for (const v of ["", undefined, null, 42, "text/html; charset=utf-8", "../../x", "application/pdf\r\nX: y"]) {
    assert.equal(normalizeContentType(v), "application/octet-stream", String(v));
  }
});

// ── 2) 直傳完成 ──────────────────────────────────────────────────────────────

const PATH = newPrintFilePath(NAME, new Date(NOW), "0123456789");

function mintTicket(overrides: Partial<UploadTicket> = {}): string {
  return signUploadTicket({ path: PATH, fileName: NAME, size: 4_321_000, exp: NOW + UPLOAD_TICKET_TTL_MS, ...overrides }, KEY);
}

function completeWorld(opts: { objects?: Record<string, number>; orders?: Record<string, string> } = {}) {
  const objects = new Map(Object.entries(opts.objects ?? { [PATH]: 4_321_000 }));
  const orders = new Map(Object.entries(opts.orders ?? {}));
  const calls = { lookup: 0, stat: 0, remove: [] as string[], finalize: [] as FinalizeArgs[] };
  let lookupFails = false;
  let statFails = false;
  let finalizeFails = false;
  const deps: CompleteDeps = {
    ticketKey: KEY,
    now: () => NOW,
    findOrderIdByStoragePath: async (path): Promise<OrderLookup> => {
      calls.lookup++;
      return lookupFails ? { ok: false } : { ok: true, id: orders.get(path) ?? null };
    },
    statObject: async (path) => {
      calls.stat++;
      if (statFails) return { status: "error" };
      return objects.has(path) ? { status: "found", size: objects.get(path)! } : { status: "missing" };
    },
    removeObject: async (path) => {
      calls.remove.push(path);
      objects.delete(path);
      return true;
    },
    finalize: async (args) => {
      calls.finalize.push(args);
      if (finalizeFails) return { ok: false, error: "db_failed" };
      const id = `order-${calls.finalize.length}`;
      orders.set(args.storagePath, id);
      return { ok: true, orderId: id, created: true };
    },
  };
  return {
    deps,
    calls,
    objects,
    orders,
    failLookup: () => (lookupFails = true),
    failStat: () => (statFails = true),
    failFinalize: () => (finalizeFails = true),
  };
}

test("complete：票券有效、物件在、大小相符 → 建單，回應與舊 /api/upload 相同（只有 ok＋fileName，不回工單資訊）", async () => {
  const w = completeWorld();
  const r = await completeDirectUpload({ ticket: mintTicket(), sessionId: "  sess-1  " }, w.deps);
  assert.deepEqual(r, { status: 200, body: { ok: true, fileName: NAME } });
  assert.equal(w.calls.finalize.length, 1);
  const args = w.calls.finalize[0];
  assert.equal(args.storagePath, PATH);
  assert.equal(args.fileName, NAME);
  assert.equal(args.sessionId, "sess-1");
  assert.equal(args.parsed.ok, true);
  assert.equal(args.parsed.segments.spec, "CCPVC720N10M");
  assert.deepEqual(w.calls.remove, []);
});

test("complete：sessionId 可省略（會員／案件都是選填）→ 以 null 建單", async () => {
  const w = completeWorld();
  assert.equal((await completeDirectUpload({ ticket: mintTicket() }, w.deps)).status, 200);
  assert.equal(w.calls.finalize[0].sessionId, null);
});

test("冪等：同一張票送兩次 → 兩次都 200，只建一張單；第二次不再碰 Storage", async () => {
  const w = completeWorld();
  const ticket = mintTicket();
  const first = await completeDirectUpload({ ticket, sessionId: "s" }, w.deps);
  const second = await completeDirectUpload({ ticket, sessionId: "s" }, w.deps);
  assert.deepEqual(first, second);
  assert.equal(first.status, 200);
  assert.equal(w.calls.finalize.length, 1);
  assert.equal(w.calls.stat, 1);
  assert.equal(w.orders.size, 1);
});

test("冪等：這個路徑早已建過單 → 直接 200，不查物件、不建單、不刪任何東西", async () => {
  const w = completeWorld({ orders: { [PATH]: "existing-order" } });
  assert.deepEqual(await completeDirectUpload({ ticket: mintTicket() }, w.deps), { status: 200, body: { ok: true, fileName: NAME } });
  assert.equal(w.calls.stat, 0);
  assert.equal(w.calls.finalize.length, 0);
  assert.deepEqual(w.calls.remove, []);
});

test("冪等查詢本身失敗 → 502 db_failed（不可當成「沒有這張單」而重複建單）", async () => {
  const w = completeWorld();
  w.failLookup();
  assert.deepEqual(await completeDirectUpload({ ticket: mintTicket() }, w.deps), { status: 502, body: { ok: false, error: "db_failed" } });
  assert.equal(w.calls.finalize.length, 0);
});

test("complete：物件不存在（沒傳成）→ 404 not_uploaded；Storage 出錯 → 502 storage_failed；都不建單", async () => {
  const missing = completeWorld({ objects: {} });
  assert.deepEqual(await completeDirectUpload({ ticket: mintTicket() }, missing.deps), {
    status: 404,
    body: { ok: false, error: "not_uploaded" },
  });
  const broken = completeWorld();
  broken.failStat();
  assert.deepEqual(await completeDirectUpload({ ticket: mintTicket() }, broken.deps), {
    status: 502,
    body: { ok: false, error: "storage_failed" },
  });
  assert.equal(missing.calls.finalize.length + broken.calls.finalize.length, 0);
});

test("complete：實際大小超過 10MB（繞過前端直接對上傳網址傳大檔）→ 刪掉該物件、413 too_large、不建單", async () => {
  const w = completeWorld({ objects: { [PATH]: MAX_UPLOAD_BYTES + 1 } });
  const r = await completeDirectUpload({ ticket: mintTicket({ size: MAX_UPLOAD_BYTES }) }, w.deps);
  assert.deepEqual(r, { status: 413, body: { ok: false, error: "too_large" } });
  assert.deepEqual(w.calls.remove, [PATH]);
  assert.equal(w.objects.has(PATH), false);
  assert.equal(w.calls.finalize.length, 0);
});

test("complete：實際大小剛好 10MB 且與票券相符 → 可以建單", async () => {
  const w = completeWorld({ objects: { [PATH]: MAX_UPLOAD_BYTES } });
  assert.equal((await completeDirectUpload({ ticket: mintTicket({ size: MAX_UPLOAD_BYTES }) }, w.deps)).status, 200);
  assert.equal(w.calls.finalize.length, 1);
});

test("complete：實際大小與票券核准的不同（被換檔／截斷）→ 刪掉、422 size_mismatch、不建單", async () => {
  const w = completeWorld({ objects: { [PATH]: 2000 } });
  const r = await completeDirectUpload({ ticket: mintTicket({ size: 1000 }) }, w.deps);
  assert.deepEqual(r, { status: 422, body: { ok: false, error: "size_mismatch" } });
  assert.deepEqual(w.calls.remove, [PATH]);
  assert.equal(w.calls.finalize.length, 0);
});

test("complete：票券竄改 → 403 bad_ticket；過期 → 403 ticket_expired；都不碰 DB／Storage", async () => {
  const w = completeWorld();
  const [payload, sig] = mintTicket().split(".");
  const forged = Buffer.from(JSON.stringify({ v: 1, p: PATH, n: NAME, s: 1, e: NOW + 1 }), "utf8").toString("base64url");
  assert.deepEqual(await completeDirectUpload({ ticket: `${forged}.${sig}` }, w.deps), {
    status: 403,
    body: { ok: false, error: "bad_ticket" },
  });
  assert.equal((await completeDirectUpload({ ticket: `${payload}.x${sig.slice(1)}` }, w.deps)).body.error, "bad_ticket");
  assert.deepEqual(await completeDirectUpload({ ticket: mintTicket({ exp: NOW }) }, w.deps), {
    status: 403,
    body: { ok: false, error: "ticket_expired" },
  });
  assert.equal(w.calls.lookup + w.calls.stat + w.calls.finalize.length, 0);
});

test("complete：輸入型別不對 → 400；沒有票券金鑰 → 503", async () => {
  const w = completeWorld();
  for (const body of [null, {}, { ticket: 1 }, { ticket: mintTicket(), sessionId: 7 }]) {
    assert.deepEqual(await completeDirectUpload(body, w.deps), { status: 400, body: { ok: false, error: "bad_request" } });
  }
  assert.equal((await completeDirectUpload({ ticket: mintTicket() }, { ...w.deps, ticketKey: null })).status, 503);
});

test("complete：票券裡的檔名在建單時重驗不過（兩次部署之間規則改了）→ 422 bad_filename，不碰 Storage、不建單", async () => {
  const name = "bad-name.pdf";
  const path = newPrintFilePath(name, new Date(NOW), "0123456789");
  const w = completeWorld({ objects: { [path]: 10 } });
  const r = await completeDirectUpload({ ticket: mintTicket({ path, fileName: name, size: 10 }) }, w.deps);
  assert.equal(r.status, 422);
  assert.equal(r.body.error, "bad_filename");
  assert.equal(w.calls.stat + w.calls.finalize.length, 0);
});

test("complete：建單失敗 → 502 db_failed", async () => {
  const w = completeWorld();
  w.failFinalize();
  assert.deepEqual(await completeDirectUpload({ ticket: mintTicket() }, w.deps), { status: 502, body: { ok: false, error: "db_failed" } });
});

// ── 3) 存檔後：建單＋背景工作 ─────────────────────────────────────────────────

const PARSED = (() => {
  const p = parseFilename(NAME);
  if (!p.ok) throw new Error("fixture parse failed");
  return p;
})();
const PRODUCT: ProductResolution = { productName: "高遮PVC+霧", productCode: "CCPVC720N", matched: true };

function finalizeWorld(opts: { createError?: unknown; existing?: string | null; lookupOk?: boolean; memberId?: string | null } = {}) {
  const calls = {
    resolve: [] as Array<[string, string]>,
    create: [] as Array<{ segments: Segments; fileName: string; storagePath: string; sessionId: string | null; memberId: string | null }>,
    background: [] as string[],
    marked: [] as Array<[string, string]>,
    logged: 0,
  };
  const deps: FinalizeDeps = {
    resolveProduct: async (spec, fallback) => {
      calls.resolve.push([spec, fallback]);
      return PRODUCT;
    },
    currentMemberId: async () => opts.memberId ?? null,
    createOrder: async (segments, fileName, storagePath, _product, sessionId, memberId) => {
      calls.create.push({ segments, fileName, storagePath, sessionId, memberId });
      if (opts.createError) throw opts.createError;
      return { id: "new-order" };
    },
    findOrderIdByStoragePath: async () => (opts.lookupOk === false ? { ok: false } : { ok: true, id: opts.existing ?? null }),
    startBackgroundJobs: (id) => calls.background.push(id),
    markSubmitted: async (sessionId, fileName) => {
      calls.marked.push([sessionId, fileName]);
    },
    logError: () => {
      calls.logged++;
    },
  };
  return { deps, calls };
}

test("finalize：查商品 → 帶 cookie 會員建單 → 背景縮圖／FTP 各起一次 → 案件成功件數 +1", async () => {
  const w = finalizeWorld({ memberId: "member-1" });
  const r = await finalizeUploadWith({ parsed: PARSED, fileName: NAME, storagePath: PATH, sessionId: "sess" }, w.deps);
  assert.deepEqual(r, { ok: true, orderId: "new-order", created: true });
  assert.deepEqual(w.calls.resolve, [["CCPVC720N10M", PARSED.segments.productName]]);
  assert.equal(w.calls.create.length, 1);
  assert.equal(w.calls.create[0].memberId, "member-1");
  assert.equal(w.calls.create[0].storagePath, PATH);
  assert.deepEqual(w.calls.background, ["new-order"]);
  assert.deepEqual(w.calls.marked, [["sess", NAME]]);
});

test("finalize：沒有 sessionId → 不更新案件", async () => {
  const w = finalizeWorld();
  await finalizeUploadWith({ parsed: PARSED, fileName: NAME, storagePath: PATH, sessionId: null }, w.deps);
  assert.deepEqual(w.calls.marked, []);
  assert.deepEqual(w.calls.background, ["new-order"]);
});

test("finalize：insert 撞 23505 且同路徑已有工單（唯一索引擋下的併發第二張）→ 冪等成功，不重跑背景工作、不重複計件", async () => {
  const w = finalizeWorld({ createError: { code: "23505", message: "duplicate key" }, existing: "winner" });
  const r = await finalizeUploadWith({ parsed: PARSED, fileName: NAME, storagePath: PATH, sessionId: "sess" }, w.deps);
  assert.deepEqual(r, { ok: true, orderId: "winner", created: false });
  assert.deepEqual(w.calls.background, []);
  assert.deepEqual(w.calls.marked, []);
});

test("finalize：撞 23505 但同路徑查無工單（撞的是別的唯一鍵，例如工單編號）→ db_failed，絕不回假成功", async () => {
  for (const opts of [
    { createError: { code: "23505" }, existing: null },
    { createError: { code: "23505" }, lookupOk: false },
    { createError: new Error("network down") },
    { createError: { code: "23503", message: "fk" } },
  ]) {
    const w = finalizeWorld(opts);
    const r = await finalizeUploadWith({ parsed: PARSED, fileName: NAME, storagePath: PATH, sessionId: "sess" }, w.deps);
    assert.deepEqual(r, { ok: false, error: "db_failed" }, JSON.stringify(opts));
    assert.deepEqual(w.calls.background, []);
    assert.deepEqual(w.calls.marked, []);
    assert.equal(w.calls.logged, 1);
  }
});

test("isUniqueViolation：只認 Postgres 23505", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  for (const v of [{ code: "23503" }, { code: 23505 }, new Error("23505"), null, undefined, "23505"]) {
    assert.equal(isUniqueViolation(v), false, String(v));
  }
});

// ── 併發：同一張票「同時」complete 兩次 ──────────────────────────────────────────
// 用一個有延遲、會交錯執行的假 work_orders 表，把真正的 completeDirectUpload + finalizeUploadWith 串起來跑。

function racingWorld(uniqueStoragePath: boolean) {
  const rows: Array<{ id: string; storage_path: string }> = [];
  const background: string[] = [];
  const tick = () => new Promise<void>((r) => setImmediate(r));
  const lookup = async (path: string): Promise<OrderLookup> => {
    await tick();
    return { ok: true, id: rows.find((row) => row.storage_path === path)?.id ?? null };
  };
  const finalizeDeps: FinalizeDeps = {
    resolveProduct: async () => {
      await tick();
      return PRODUCT;
    },
    currentMemberId: async () => null,
    createOrder: async (_s, _f, storagePath) => {
      await tick();
      if (uniqueStoragePath && rows.some((row) => row.storage_path === storagePath)) {
        throw { code: "23505", message: 'duplicate key value violates unique constraint "work_orders_storage_path_key"' };
      }
      const id = `order-${rows.length + 1}`;
      rows.push({ id, storage_path: storagePath });
      return { id };
    },
    findOrderIdByStoragePath: lookup,
    startBackgroundJobs: (id) => background.push(id),
    markSubmitted: async () => {},
    logError: silent,
  };
  const deps: CompleteDeps = {
    ticketKey: KEY,
    now: () => NOW,
    findOrderIdByStoragePath: lookup,
    statObject: async () => {
      await tick();
      return { status: "found", size: 4_321_000 };
    },
    removeObject: async () => true,
    finalize: (args) => finalizeUploadWith(args, finalizeDeps),
  };
  return { deps, rows, background };
}

test("併發＋唯一索引：同一張票同時 complete 兩次 → 兩邊都 200、只有一張工單、背景工作只跑一次", async () => {
  const w = racingWorld(true);
  const ticket = mintTicket();
  const [a, b] = await Promise.all([completeDirectUpload({ ticket }, w.deps), completeDirectUpload({ ticket }, w.deps)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(w.rows.length, 1);
  assert.deepEqual(w.background, ["order-1"]);
});

test("併發＋沒有唯一索引（現況）：「先查再建」擋不住同時送達的兩次 → 會多一張重複工單（所以回報附了唯一索引 SQL）", async () => {
  const w = racingWorld(false);
  const ticket = mintTicket();
  const [a, b] = await Promise.all([completeDirectUpload({ ticket }, w.deps), completeDirectUpload({ ticket }, w.deps)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(w.rows.length, 2);
  // 依序（非同時）重送仍然擋得住：
  const again = await completeDirectUpload({ ticket }, w.deps);
  assert.equal(again.status, 200);
  assert.equal(w.rows.length, 2);
});

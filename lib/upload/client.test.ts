import assert from "node:assert/strict";
import test from "node:test";
import { CONTACT } from "@/lib/site/content";
import { tooLargeMessage, uploadViaTicket, type DirectUploadDeps } from "./client";
import { MAX_UPLOAD_BYTES } from "./limits";

test("tooLargeMessage：說出實際大小與 10 MB 上限、建議壓縮或改用 LINE／Email；聯絡管道取自網站設定", () => {
  const m = tooLargeMessage(MAX_UPLOAD_BYTES + 1);
  assert.match(m.text, /10\.1 MB/);
  assert.match(m.text, /上限 10 MB/);
  assert.match(m.text, /壓縮/);
  assert.match(m.text, /LINE/);
  assert.match(m.text, /Email/);
  assert.deepEqual(
    m.links.map((l) => l.href),
    [CONTACT.line, `mailto:${CONTACT.email}`]
  );
  assert.match(tooLargeMessage(25 * 1024 * 1024).text, /25\.0 MB/);
});

type Call = { url: string; body: unknown };

function fakeDeps(script: {
  ticket?: Array<{ status: number; data: Record<string, unknown> | null } | null>;
  put?: Array<{ status: number; body: string } | null>;
  complete?: Array<{ status: number; data: Record<string, unknown> | null } | null>;
}) {
  const calls = { ticket: [] as Call[], complete: [] as Call[], put: [] as Array<{ url: string; contentType: string }>, sleeps: [] as number[] };
  const queues = { ticket: [...(script.ticket ?? [])], put: [...(script.put ?? [])], complete: [...(script.complete ?? [])] };
  const deps: DirectUploadDeps = {
    postJson: async (url, body) => {
      if (url === "/api/upload/ticket") {
        calls.ticket.push({ url, body });
        return queues.ticket.shift() ?? null;
      }
      calls.complete.push({ url, body });
      return queues.complete.shift() ?? null;
    },
    put: async (url, _file, contentType, onProgress) => {
      calls.put.push({ url, contentType });
      onProgress(0.5);
      return queues.put.shift() ?? null;
    },
    sleep: async (ms) => {
      calls.sleeps.push(ms);
    },
  };
  return { deps, calls };
}

const FILE = Object.assign(new Blob([new Uint8Array(2048)], { type: "application/pdf" }), { name: "x.pdf" });
const TICKET_OK = { status: 200, data: { ok: true, uploadUrl: "https://s.example/upload?token=t", ticket: "tk", contentType: "application/pdf" } };
const OK = { status: 200, data: { ok: true, fileName: "x.pdf" } };

test("直傳：ticket → PUT（用伺服器回的 contentType、回報進度）→ complete（帶 ticket＋sessionId）→ ok", async () => {
  const f = fakeDeps({ ticket: [TICKET_OK], put: [{ status: 200, body: "{}" }], complete: [OK] });
  const progress: number[] = [];
  const r = await uploadViaTicket(FILE, "sess-1", (p) => progress.push(p), f.deps);
  assert.deepEqual(r, { kind: "ok" });
  assert.deepEqual(f.calls.ticket[0].body, { fileName: "x.pdf", size: 2048, contentType: "application/pdf" });
  assert.deepEqual(f.calls.put, [{ url: "https://s.example/upload?token=t", contentType: "application/pdf" }]);
  assert.deepEqual(f.calls.complete[0].body, { ticket: "tk", sessionId: "sess-1" });
  assert.deepEqual(progress, [0.5, 1]);
});

test("直傳：ticket 回 413 too_large → too_large，不上傳", async () => {
  const f = fakeDeps({ ticket: [{ status: 413, data: { ok: false, error: "too_large" } }] });
  assert.deepEqual(await uploadViaTicket(FILE, "s", () => {}, f.deps), { kind: "too_large" });
  assert.equal(f.calls.put.length, 0);
});

test("直傳：儲存桶拒收（HTTP 413 或 body statusCode 413）→ too_large；其他 PUT 失敗／網路錯 → failed，不打 complete", async () => {
  for (const put of [{ status: 413, body: "" }, { status: 400, body: '{"statusCode":"413","error":"Payload too large"}' }]) {
    const f = fakeDeps({ ticket: [TICKET_OK], put: [put] });
    assert.deepEqual(await uploadViaTicket(FILE, "s", () => {}, f.deps), { kind: "too_large" });
    assert.equal(f.calls.complete.length, 0);
  }
  for (const put of [{ status: 403, body: '{"statusCode":"403"}' }, null]) {
    const f = fakeDeps({ ticket: [TICKET_OK], put: [put] });
    const r = await uploadViaTicket(FILE, "s", () => {}, f.deps);
    assert.equal(r.kind, "failed");
    assert.equal(f.calls.complete.length, 0);
  }
});

test("直傳：ticket 失敗（網路錯、檔名被伺服器打回、回應不是 JSON）→ failed", async () => {
  for (const t of [null, { status: 422, data: { ok: false, error: "bad_filename" } }, { status: 500, data: null }]) {
    const f = fakeDeps({ ticket: [t] });
    const r = await uploadViaTicket(FILE, "s", () => {}, f.deps);
    assert.equal(r.kind, "failed");
    assert.equal(f.calls.put.length, 0);
  }
});

test("直傳：complete 網路錯或 5xx → 等一下自動重送一次（complete 冪等）；4xx 不重送", async () => {
  const retried = fakeDeps({ ticket: [TICKET_OK], put: [{ status: 200, body: "{}" }], complete: [null, OK] });
  assert.deepEqual(await uploadViaTicket(FILE, "s", () => {}, retried.deps), { kind: "ok" });
  assert.equal(retried.calls.complete.length, 2);
  assert.deepEqual(retried.calls.sleeps, [1500]);

  const gaveUp = fakeDeps({
    ticket: [TICKET_OK],
    put: [{ status: 200, body: "{}" }],
    complete: [{ status: 502, data: { ok: false, error: "db_failed" } }, { status: 502, data: { ok: false, error: "db_failed" } }],
  });
  const r = await uploadViaTicket(FILE, "s", () => {}, gaveUp.deps);
  assert.equal(r.kind, "failed");
  assert.equal(gaveUp.calls.complete.length, 2);

  const notUploaded = fakeDeps({ ticket: [TICKET_OK], put: [{ status: 200, body: "{}" }], complete: [{ status: 404, data: { ok: false, error: "not_uploaded" } }] });
  assert.equal((await uploadViaTicket(FILE, "s", () => {}, notUploaded.deps)).kind, "failed");
  assert.equal(notUploaded.calls.complete.length, 1);
  assert.deepEqual(notUploaded.calls.sleeps, []);

  const tooLarge = fakeDeps({ ticket: [TICKET_OK], put: [{ status: 200, body: "{}" }], complete: [{ status: 413, data: { ok: false, error: "too_large" } }] });
  assert.deepEqual(await uploadViaTicket(FILE, "s", () => {}, tooLarge.deps), { kind: "too_large" });
});

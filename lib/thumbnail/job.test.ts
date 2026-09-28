import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runThumbnailJob, type ThumbnailJobDeps, type ThumbnailRow } from "./job";
import { autoThumbnailPath, canClaimThumbnail, isThumbnailRetryable, THUMBNAIL_LEASE_MS, THUMBNAIL_MAX_TRIES } from "./policy";
import { thumbnailGenerateResponse } from "./response";

// ── 假的 work_orders 表：只實作 job.ts 用到的 supabase-js 介面（select/update + eq/is + select），
// 語意照 PostgREST：update 的 WHERE 在「執行當下」判斷並寫入（同步完成 = 原子），jsonb 的 eq 是語意相等。
// 每個請求前後各 await 一次延遲，讓兩個 job 真的交錯執行。

type Row = ThumbnailRow & Record<string, unknown>;
type Filter = { col: string; op: "eq" | "is"; value: string | null };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const cell = row[f.col];
    if (f.op === "is") return cell === null || cell === undefined;
    if (f.col === "thumbnail_meta") return canonical(cell) === canonical(JSON.parse(f.value as string));
    return cell !== null && cell !== undefined && String(cell) === f.value;
  });
}

type FaultMode = "error_not_applied" | "error_but_applied";

class FakeDb {
  rows = new Map<string, Row>();
  successfulPathWrites = 0;
  updateCalls = 0;
  selectCalls = 0;
  faults: FaultMode[] = []; // 依序套用在接下來的 update 上
  failReads = 0; // 接下來幾次 select 直接回錯
  latency: () => Promise<void> = () => new Promise((r) => setImmediate(r));

  client(): SupabaseClient {
    return { from: (table: string) => this.table(table) } as unknown as SupabaseClient;
  }

  private table(table: string) {
    assert.equal(table, "work_orders");
    return {
      select: (_cols: string) => this.builder("select", null),
      update: (patch: Record<string, unknown>) => this.builder("update", patch),
    };
  }

  private builder(kind: "select" | "update", patch: Record<string, unknown> | null) {
    const filters: Filter[] = [];
    const self = this;
    const b = {
      eq(col: string, value: string) {
        filters.push({ col, op: "eq", value: String(value) });
        return b;
      },
      is(col: string, value: null) {
        assert.equal(value, null);
        filters.push({ col, op: "is", value: null });
        return b;
      },
      select(_cols: string) {
        return b;
      },
      then<T>(onOk: (v: { data: Row[] | null; error: { message: string } | null }) => T, onErr?: (e: unknown) => T) {
        return self.execute(kind, patch, filters).then(onOk, onErr);
      },
    };
    return b;
  }

  private async execute(kind: "select" | "update", patch: Record<string, unknown> | null, filters: Filter[]) {
    await this.latency();
    let result: { data: Row[] | null; error: { message: string } | null };
    if (kind === "select") {
      this.selectCalls++;
      if (this.failReads > 0) {
        this.failReads--;
        result = { data: null, error: { message: "network" } };
      } else {
        result = { data: [...this.rows.values()].filter((r) => matches(r, filters)).map((r) => structuredClone(r)), error: null };
      }
    } else {
      this.updateCalls++;
      const fault = this.faults.shift();
      if (fault === "error_not_applied") {
        result = { data: null, error: { message: "network" } };
      } else {
        const hit = [...this.rows.values()].filter((r) => matches(r, filters));
        for (const r of hit) {
          Object.assign(r, structuredClone(patch));
          if (patch && typeof patch.thumbnail_path === "string") this.successfulPathWrites++;
        }
        result =
          fault === "error_but_applied"
            ? { data: null, error: { message: "network" } }
            : { data: hit.map((r) => structuredClone(r)), error: null };
      }
    }
    await this.latency();
    return result;
  }

  get(id: string): Row {
    return this.rows.get(id)!;
  }
}

const ORDER_ID = "0c3b8a4e-1111-4222-8333-944445555666";

function newRow(overrides: Partial<Row> = {}): Row {
  return {
    id: ORDER_ID,
    storage_path: "orders/202609/abc-file.pdf",
    thumbnail_path: null,
    thumbnail_status: "pending",
    thumbnail_meta: {},
    ...overrides,
  };
}

type Harness = {
  db: FakeDb;
  deps: ThumbnailJobDeps;
  clock: { now: number };
  renders: number;
  downloads: number;
  storage: Set<string>;
  removed: string[];
  /** 讓 renderJpeg 停在這裡，直到呼叫 release()（用來在產圖途中插入別的事件）。 */
  gateRender(): { entered: Promise<void>; release: () => void };
};

function harness(
  row: Row = newRow(),
  opts: { size?: number | null; render?: (bytes: Uint8Array, index: number) => Promise<Buffer | null> } = {}
): Harness {
  const db = new FakeDb();
  db.rows.set(row.id, structuredClone(row));
  let leaseSeq = 0;
  let gate: { entered: () => void; wait: Promise<void> } | null = null;
  const h: Harness = {
    db,
    clock: { now: Date.parse("2026-09-29T00:00:00.000Z") },
    renders: 0,
    downloads: 0,
    storage: new Set(),
    removed: [],
    deps: undefined as unknown as ThumbnailJobDeps,
    gateRender() {
      let entered!: () => void;
      let release!: () => void;
      const enteredP = new Promise<void>((r) => (entered = r));
      const wait = new Promise<void>((r) => (release = r));
      gate = { entered, wait };
      return { entered: enteredP, release };
    },
  };
  h.deps = {
    db: db.client(),
    printFileSize: async () => (opts.size === undefined ? 1234 : opts.size),
    downloadPrintFile: async () => {
      h.downloads++;
      return new ArrayBuffer(16);
    },
    renderJpeg: async (bytes) => {
      const index = ++h.renders; // 第幾次開始渲染（1 起算）
      if (gate) {
        const g = gate;
        gate = null;
        g.entered();
        await g.wait;
      }
      return opts.render ? opts.render(bytes, index) : Buffer.from("jpeg");
    },
    uploadNewThumbnail: async (path) => {
      if (h.storage.has(path)) return false; // upsert:false
      h.storage.add(path);
      return true;
    },
    removeThumbnail: async (path) => {
      h.removed.push(path);
      h.storage.delete(path);
    },
    now: () => h.clock.now,
    newLeaseId: () => `lease-${++leaseSeq}`,
  };
  return h;
}

const meta = (row: Row) => row.thumbnail_meta as Record<string, unknown>;

test("產圖：搶到租約 → 產一次、寫回 ok；tries 記 1、租約欄位清掉、路徑是這次租約專用的 -auto- 路徑", async () => {
  const h = harness();
  const result = await runThumbnailJob(newRow(), h.deps);
  const row = h.db.get(ORDER_ID);
  assert.equal(result.ran, true);
  assert.equal(result.confirmed, true);
  assert.equal(h.renders, 1);
  assert.equal(row.thumbnail_status, "ok");
  assert.equal(row.thumbnail_path, autoThumbnailPath(ORDER_ID, "lease-1"));
  assert.equal(meta(row).tries, 1);
  assert.equal(meta(row).lease_until, undefined);
  assert.equal(meta(row).lease_id, undefined);
  assert.deepEqual([...h.storage], [row.thumbnail_path]);
});

test("搶佔：兩個呼叫同時拿同一份快照（兩個分頁同開）→ 只有一個真的產，另一個在對方產圖期間回 inProgress、DB 只寫一次", async () => {
  const h = harness();
  const gate = h.gateRender(); // 讓搶到的那一方停在渲染途中
  const pa = runThumbnailJob(newRow(), h.deps);
  const pb = runThumbnailJob(newRow(), h.deps);
  await gate.entered;
  const loser = await Promise.race([pa, pb]); // 搶到的那方還卡在渲染，先回來的一定是沒搶到的
  assert.equal(loser.ran, false);
  assert.equal(loser.inProgress, true);
  const body = thumbnailGenerateResponse(loser);
  assert.deepEqual([body.hasThumbnail, body.inProgress], [false, true]);
  gate.release();
  const [a, b] = await Promise.all([pa, pb]);
  assert.equal(h.renders, 1);
  assert.equal(h.downloads, 1);
  assert.equal(h.db.successfulPathWrites, 1);
  assert.equal(h.storage.size, 1);
  const winner = a.ran ? a : b;
  assert.equal(winner.row.thumbnail_status, "ok");
  assert.equal([a, b].filter((r) => r.ran).length, 1);
  assert.equal(meta(h.db.get(ORDER_ID)).tries, 1);
});

test("搶佔：收檔背景觸發（kick）與開頁觸發、再加一個分頁，三方交錯 50 輪 → 每輪都只產一次、只寫一次", async () => {
  for (let round = 0; round < 50; round++) {
    const h = harness();
    // 隨機延遲讓請求以各種順序交錯
    h.db.latency = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 3)));
    const results = await Promise.all([0, 1, 2].map(() => runThumbnailJob(newRow(), h.deps)));
    assert.equal(h.renders, 1, `round ${round}`);
    assert.equal(h.db.successfulPathWrites, 1, `round ${round}`);
    assert.equal(results.filter((r) => r.ran).length, 1, `round ${round}`);
    const row = h.db.get(ORDER_ID);
    assert.deepEqual([...h.storage], [row.thumbnail_path], `round ${round}`);
    // 沒搶到的：不是回 inProgress（對方還在產），就是讀到已完成的結果
    for (const r of results.filter((x) => !x.ran)) {
      assert.ok(r.inProgress || r.row.thumbnail_path === row.thumbnail_path, `round ${round}`);
    }
  }
});

test("租約期限內：別人持有租約 → 不搶、不產，回 inProgress", async () => {
  const h = harness();
  const leased = newRow({
    thumbnail_meta: { tries: 1, lease_id: "other", lease_until: new Date(h.clock.now + 30_000).toISOString() },
  });
  h.db.rows.set(ORDER_ID, structuredClone(leased));
  const result = await runThumbnailJob(leased, h.deps);
  assert.equal(result.ran, false);
  assert.equal(result.inProgress, true);
  assert.equal(h.renders, 0);
  assert.equal(h.db.updateCalls, 0);
});

test("應修1：被平台砍掉的嘗試（搶到租約後就沒下文）也記一次 tries；租約過期才能被重搶，滿 3 次就不再自動跑", async () => {
  const h = harness();
  // 第 1 次：搶到租約後卡在渲染（模擬逾時被平台砍掉，永遠不會寫回）
  h.gateRender();
  void runThumbnailJob(newRow(), h.deps);
  await new Promise((r) => setTimeout(r, 20));
  let row = h.db.get(ORDER_ID);
  assert.equal(meta(row).tries, 1, "開工當下就已記一次");
  assert.equal(row.thumbnail_status, "pending");

  // 租約還沒過期：別人來也不會搶
  h.clock.now += THUMBNAIL_LEASE_MS - 1_000;
  assert.equal((await runThumbnailJob(structuredClone(row), h.deps)).inProgress, true);
  assert.equal(h.renders, 1);

  // 租約過期後才能重搶：第 2、3 次也都被砍（渲染卡住）
  for (const expectTries of [2, 3]) {
    h.clock.now += THUMBNAIL_LEASE_MS + 1_000;
    h.gateRender();
    void runThumbnailJob(structuredClone(h.db.get(ORDER_ID)), h.deps);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(meta(h.db.get(ORDER_ID)).tries, expectTries);
  }

  // 3 次都被砍、租約也過了 → 不再自動跑（不會每次開頁都燒滿 60 秒）
  h.clock.now += THUMBNAIL_LEASE_MS + 1_000;
  row = h.db.get(ORDER_ID);
  assert.equal(canClaimThumbnail(row, h.clock.now), false);
  const last = await runThumbnailJob(structuredClone(row), h.deps);
  assert.equal(last.ran, false);
  assert.equal(h.renders, 3);
  const body = thumbnailGenerateResponse(last);
  assert.deepEqual([body.hasThumbnail, body.inProgress, body.retryable], [false, false, false]);
});

test("失敗只在開工時計一次：渲染丟錯（例如 PDFium 崩潰）→ failed、tries=1（不會變 2）、記 last_error、清租約", async () => {
  const h = harness(newRow(), {
    render: async () => {
      throw new Error("pdfium_crashed");
    },
  });
  const result = await runThumbnailJob(newRow(), h.deps);
  const row = h.db.get(ORDER_ID);
  assert.equal(result.confirmed, true);
  assert.equal(row.thumbnail_status, "failed");
  assert.equal(meta(row).tries, 1);
  assert.equal(meta(row).last_error, "pdfium_crashed");
  assert.equal(meta(row).lease_until, undefined);
  assert.equal(isThumbnailRetryable(row), true);
  assert.equal(h.storage.size, 0);
});

test("格式不支援（渲染回 null）→ unsupported/unsupported_format；太大（Storage 回報 >25MB）→ 不下載、unsupported/too_large", async () => {
  const h1 = harness(newRow(), { render: async () => null });
  await runThumbnailJob(newRow(), h1.deps);
  assert.equal(h1.db.get(ORDER_ID).thumbnail_status, "unsupported");
  assert.equal(meta(h1.db.get(ORDER_ID)).reason, "unsupported_format");

  const h2 = harness(newRow(), { size: 26 * 1024 * 1024 });
  await runThumbnailJob(newRow(), h2.deps);
  assert.equal(h2.downloads, 0);
  assert.equal(h2.db.get(ORDER_ID).thumbnail_status, "unsupported");
  assert.equal(meta(h2.db.get(ORDER_ID)).reason, "too_large");
});

test("必修1情境4：自動產圖途中同事人工補圖 → 自動結果作廢、不覆蓋人工圖，自己剛上傳的檔被刪掉", async () => {
  const h = harness();
  const gate = h.gateRender();
  const job = runThumbnailJob(newRow(), h.deps);
  await gate.entered;
  // 模擬 app/api/admin/order/[id]/thumbnail 人工補圖：無條件寫 path＋manual，不動 meta
  const manualPath = `thumbs/${ORDER_ID}-manual-thumbnail-1790000000000.jpg`;
  Object.assign(h.db.get(ORDER_ID), { thumbnail_path: manualPath, thumbnail_status: "manual" });
  gate.release();
  const result = await job;
  const row = h.db.get(ORDER_ID);
  assert.equal(row.thumbnail_path, manualPath);
  assert.equal(row.thumbnail_status, "manual");
  assert.equal(h.db.successfulPathWrites, 0);
  assert.deepEqual(h.removed, [autoThumbnailPath(ORDER_ID, "lease-1")]);
  assert.equal(h.storage.size, 0);
  assert.equal(result.confirmed, true);
  assert.equal(result.row.thumbnail_path, manualPath);
  assert.equal(thumbnailGenerateResponse(result).hasThumbnail, true);
});

test("晚完成的自動結果不覆蓋別人已寫好的結果：A 逾時後 B 接手完成，A 才回來 → A 作廢、刪自己的檔，DB 保留 B 的圖", async () => {
  const h = harness();
  const gate = h.gateRender();
  const jobA = runThumbnailJob(newRow(), h.deps);
  await gate.entered;
  h.clock.now += THUMBNAIL_LEASE_MS + 1_000; // A 的租約過期（本機沒有 maxDuration 會發生）
  const b = await runThumbnailJob(structuredClone(h.db.get(ORDER_ID)), h.deps);
  assert.equal(b.ran, true);
  const bPath = autoThumbnailPath(ORDER_ID, "lease-2");
  assert.equal(h.db.get(ORDER_ID).thumbnail_path, bPath);
  gate.release();
  const a = await jobA;
  const row = h.db.get(ORDER_ID);
  assert.equal(row.thumbnail_path, bPath);
  assert.equal(row.thumbnail_status, "ok");
  assert.equal(h.db.successfulPathWrites, 1);
  assert.deepEqual(h.removed, [autoThumbnailPath(ORDER_ID, "lease-1")]);
  assert.deepEqual([...h.storage], [bPath]);
  assert.equal(a.row.thumbnail_path, bPath);
});

test("晚到的失敗翻不掉已成功的結果：A 逾時後 B 成功，A 才以失敗回來 → DB 仍是 ok＋B 的圖", async () => {
  const h = harness(newRow(), {
    render: async (_bytes, index) => {
      if (index === 1) throw new Error("late_failure"); // A（第 1 個開始渲染的）最後失敗
      return Buffer.from("jpeg");
    },
  });
  const gate = h.gateRender();
  const jobA = runThumbnailJob(newRow(), h.deps);
  await gate.entered;
  h.clock.now += THUMBNAIL_LEASE_MS + 1_000;
  await runThumbnailJob(structuredClone(h.db.get(ORDER_ID)), h.deps); // B：成功
  gate.release();
  await jobA; // A：失敗，但寫不回去
  const row = h.db.get(ORDER_ID);
  assert.equal(row.thumbnail_status, "ok");
  assert.equal(row.thumbnail_path, autoThumbnailPath(ORDER_ID, "lease-2"));
  assert.equal(meta(row).last_error, undefined);
});

test("寫回請求失敗（沒寫進去）→ 重讀確認仍是自己的租約 → 重試一次成功", async () => {
  const h = harness();
  h.db.faults = [undefined as unknown as FaultMode, "error_not_applied"]; // 第 1 個 update（搶租約）正常，第 2 個（寫回）失敗
  const result = await runThumbnailJob(newRow(), h.deps);
  assert.equal(result.confirmed, true);
  assert.equal(h.db.get(ORDER_ID).thumbnail_status, "ok");
  assert.equal(h.db.successfulPathWrites, 1);
  assert.equal(h.removed.length, 0);
});

test("寫回請求回報失敗但其實已寫入 → 重讀發現是自己寫的，照成功回報、不刪檔", async () => {
  const h = harness();
  h.db.faults = [undefined as unknown as FaultMode, "error_but_applied"];
  const result = await runThumbnailJob(newRow(), h.deps);
  assert.equal(result.confirmed, true);
  assert.equal(result.row.thumbnail_status, "ok");
  assert.equal(h.removed.length, 0);
  assert.equal(h.db.updateCalls, 2);
});

test("可選2：寫回失敗、重讀也失敗 → confirmed=false；端點回「沒有縮圖、可重試」，不謊報已有縮圖；已上傳的檔保留", async () => {
  const h = harness();
  h.db.faults = [undefined as unknown as FaultMode, "error_not_applied"];
  h.db.failReads = 1;
  const result = await runThumbnailJob(newRow(), h.deps);
  assert.equal(result.confirmed, false);
  const body = thumbnailGenerateResponse(result);
  assert.deepEqual([body.hasThumbnail, body.retryable, body.inProgress], [false, true, false]);
  assert.equal(h.removed.length, 0);
});

test("搶租約的請求回報失敗但其實已寫入 → 重讀看到自己的 lease_id，照常開工（不會卡在自己的租約上）", async () => {
  const h = harness();
  h.db.faults = ["error_but_applied"];
  const result = await runThumbnailJob(newRow(), h.deps);
  assert.equal(result.ran, true);
  assert.equal(h.renders, 1);
  assert.equal(h.db.get(ORDER_ID).thumbnail_status, "ok");
  assert.equal(meta(h.db.get(ORDER_ID)).tries, 1);
});

test("快照過期但仍可開工（別人剛結束一次失敗）→ 重讀後再搶一次", async () => {
  const h = harness();
  const stale = newRow();
  h.db.rows.set(ORDER_ID, structuredClone(newRow({ thumbnail_status: "failed", thumbnail_meta: { tries: 1, last_error: "x" } })));
  const result = await runThumbnailJob(stale, h.deps);
  assert.equal(result.ran, true);
  assert.equal(meta(h.db.get(ORDER_ID)).tries, 2);
  assert.equal(h.db.get(ORDER_ID).thumbnail_status, "ok");
});

test("已有縮圖／終態／次數用完 → 完全不碰 DB 寫入", async () => {
  for (const row of [
    newRow({ thumbnail_path: "thumbs/x.jpg", thumbnail_status: "ok" }),
    newRow({ thumbnail_status: "unsupported" }),
    newRow({ thumbnail_status: "manual", thumbnail_path: "thumbs/x-manual-thumbnail-1.jpg" }),
    newRow({ thumbnail_status: "failed", thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES } }),
    newRow({ thumbnail_status: "pending", thumbnail_meta: { tries: THUMBNAIL_MAX_TRIES } }),
  ]) {
    const h = harness(row);
    const result = await runThumbnailJob(structuredClone(row), h.deps);
    assert.equal(result.ran, false);
    assert.equal(h.db.updateCalls, 0);
    assert.equal(h.renders, 0);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { createPdfFirstPageRenderer, PdfEngineError, renderPdfFirstPageToRaw, type PdfLibrary } from "./renderPdf";

// ── 假的 PDFium：可以指定每份文件「打不開」「渲染時 wasm 崩潰」或正常，並記錄同時開著幾份文件。
type Behavior = "ok" | "bad_file" | "crash_on_load" | "crash_on_render" | "alloc_fail";

function fakePdfium() {
  const stats = { inits: 0, openDocs: 0, peakOpenDocs: 0, destroyedDocs: 0, destroyedLibs: 0, libraryIds: [] as number[] };
  let initFailures = 0;
  const init = async (): Promise<PdfLibrary> => {
    await new Promise((r) => setImmediate(r));
    if (initFailures > 0) {
      initFailures--;
      throw new Error("init failed");
    }
    const libraryId = ++stats.inits;
    let crashed = false;
    return {
      async loadDocument(buff: Uint8Array) {
        await new Promise((r) => setImmediate(r)); // 真的 loadDocument 在 malloc 之後也會 await
        stats.libraryIds.push(libraryId);
        if (crashed) throw new WebAssembly.RuntimeError("Aborted(module already aborted)");
        const behavior = Buffer.from(buff).toString() as Behavior;
        if (behavior === "bad_file") throw new Error("File not in PDF format or corrupted");
        if (behavior === "crash_on_load") {
          crashed = true;
          throw new WebAssembly.RuntimeError("Aborted(OOM)");
        }
        stats.openDocs++;
        stats.peakOpenDocs = Math.max(stats.peakOpenDocs, stats.openDocs);
        const page = {
          getOriginalSize: () => ({ originalWidth: 595.28, originalHeight: 841.89 }),
          async render({ width, height }: { width: number; height: number }) {
            await new Promise((r) => setImmediate(r));
            if (behavior === "crash_on_render") {
              crashed = true;
              throw new WebAssembly.RuntimeError("unreachable");
            }
            if (behavior === "alloc_fail") throw new Error("Failed to allocate memory for bitmap");
            return { data: new Uint8Array(width * height * 4).fill(libraryId), width, height };
          },
        };
        return {
          *pages() {
            yield page;
          },
          destroy() {
            stats.openDocs--;
            stats.destroyedDocs++;
          },
        };
      },
      destroy() {
        stats.destroyedLibs++;
      },
    };
  };
  return { init, stats, failNextInits: (n: number) => (initFailures = n) };
}

const doc = (b: Behavior) => Buffer.from(b);

test("PDFium 串行：同時丟 20 份，任何時刻只開著 1 份文件；每份都在 finally 釋放；只 init 一次", async () => {
  const fake = fakePdfium();
  const render = createPdfFirstPageRenderer(fake.init);
  const results = await Promise.all(Array.from({ length: 20 }, () => render(doc("ok"))));
  assert.ok(results.every((r) => r && r.width === 848 && r.height === 1200));
  assert.equal(fake.stats.peakOpenDocs, 1);
  assert.equal(fake.stats.openDocs, 0);
  assert.equal(fake.stats.destroyedDocs, 20);
  assert.equal(fake.stats.inits, 1);
});

test("PDFium 崩潰：只有當下這一份丟 PdfEngineError（可重試）；排隊中的其他文件改用新實例、全部成功，不會被標成不支援", async () => {
  const fake = fakePdfium();
  const render = createPdfFirstPageRenderer(fake.init);
  const jobs = [doc("ok"), doc("crash_on_render"), doc("ok"), doc("ok"), doc("ok")].map((d) => render(d).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  ));
  const results = await Promise.all(jobs);
  assert.equal(results[0].ok && results[0].value?.width, 848);
  assert.equal(results[1].ok, false);
  assert.ok(!results[1].ok && results[1].error instanceof PdfEngineError);
  for (const r of results.slice(2)) {
    assert.ok(r.ok && r.value, "排在崩潰之後的文件必須成功，不可回 null（null 會被標成 unsupported 終態）");
    assert.equal(r.value.data[0], 2, "崩潰後改用第 2 個實例");
  }
  assert.equal(fake.stats.inits, 2);
  assert.equal(fake.stats.destroyedLibs, 1);
  assert.equal(fake.stats.openDocs, 0, "崩潰的那份也在 finally 釋放");
});

test("PDFium 載入時就崩潰（wasm abort）→ PdfEngineError＋換實例；下一份正常", async () => {
  const fake = fakePdfium();
  const render = createPdfFirstPageRenderer(fake.init);
  await assert.rejects(render(doc("crash_on_load")), PdfEngineError);
  const next = await render(doc("ok"));
  assert.equal(next?.data[0], 2);
});

test("點陣圖配置不到記憶體（一般 Error）→ 也當引擎問題：PdfEngineError＋換新實例（新 heap）", async () => {
  const fake = fakePdfium();
  const render = createPdfFirstPageRenderer(fake.init);
  await assert.rejects(render(doc("alloc_fail")), (err: unknown) => err instanceof PdfEngineError && err.message === "pdfium_render_failed");
  assert.equal((await render(doc("ok")))?.data[0], 2);
});

test("檔案本身打不開（毀損／加密）→ 回 null（unsupported），實例照用、不重新 init", async () => {
  const fake = fakePdfium();
  const render = createPdfFirstPageRenderer(fake.init);
  assert.equal(await render(doc("bad_file")), null);
  assert.ok(await render(doc("ok")));
  assert.equal(fake.stats.inits, 1);
});

test("init 失敗 → PdfEngineError（不是 null）；不快取失敗，下一份重新 init 成功", async () => {
  const fake = fakePdfium();
  fake.failNextInits(1);
  const render = createPdfFirstPageRenderer(fake.init);
  await assert.rejects(render(doc("ok")), (err: unknown) => err instanceof PdfEngineError && err.message === "pdfium_init_failed");
  assert.ok(await render(doc("ok")));
  assert.equal(fake.stats.inits, 1);
});

// ── 真的 PDFium（@hyzyla/pdfium）：併發呼叫也照樣正確，壞檔不影響之後的文件
function makePdf(w: number, h: number, rgb: [number, number, number]): Buffer {
  const content = `${rgb.map((c) => (c / 255).toFixed(3)).join(" ")} rg 0 0 ${w} ${h} re f`;
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

test("真 PDFium：A4 與 90×180cm 混合併發 10 份 → 尺寸、顏色逐份正確；壞檔回 null 後下一份照常", async () => {
  const red = makePdf(595.28, 841.89, [255, 0, 0]);
  const green = makePdf(2551.18, 5102.36, [0, 160, 0]);
  const inputs = Array.from({ length: 10 }, (_, i) => (i % 2 ? green : red));
  const results = await Promise.all(inputs.map((pdf) => renderPdfFirstPageToRaw(pdf)));
  results.forEach((r, i) => {
    assert.ok(r);
    const expectGreen = i % 2 === 1;
    assert.deepEqual([r.width, r.height], expectGreen ? [600, 1200] : [848, 1200]);
    const center = (Math.floor(r.height / 2) * r.width + Math.floor(r.width / 2)) * 4;
    const px = [r.data[center], r.data[center + 1], r.data[center + 2]];
    const want = expectGreen ? [0, 160, 0] : [255, 0, 0];
    assert.ok(px.every((v, k) => Math.abs(v - want[k]) <= 3), `#${i} center=${px}`);
  });
  assert.equal(await renderPdfFirstPageToRaw(Buffer.from("%PDF-1.4 garbage")), null);
  assert.equal((await renderPdfFirstPageToRaw(red))?.width, 848);
});

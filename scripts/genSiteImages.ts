// 批次生成官網站圖 → 上傳 Supabase Storage(site-media) → 寫 site_images。
//
// 用法：
//   npm run gen:images                 只補還沒有圖的（冪等，可重跑）
//   npm run gen:images -- --force      全部重生
//   npm run gen:images -- --only=hero.main,work.1
//   npm run gen:images -- --seed-only  只建/更新 13 筆 slot 資料列，不生圖
//
// 13 張 × 每張約 20–25 秒，遠超 Vercel serverless 上限，所以走本機腳本；
// 後台的「重生單張」才是走 API route。
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { IMAGE_SLOTS, buildPrompt } from "../lib/site/imageSlots";
import { generateImage, DEFAULT_IMAGE_MODEL } from "../lib/ai/image";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 讀 .env.local（同 scripts/importErp.mjs）
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing supabase env");
const db = createClient(url, key, { auth: { persistSession: false } });

const BUCKET = "site-media";
const args = process.argv.slice(2);
const force = args.includes("--force");
const seedOnly = args.includes("--seed-only");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()) : null;

// preview 一律寫這裡，不污染 repo。原圖可能 >2000px，主對話只能看這些縮圖。
const previewDir = process.env.PREVIEW_DIR || "/tmp/nina-site-images";
mkdirSync(previewDir, { recursive: true });

function publicUrl(path: string) {
  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

// 1) 先把 13 筆 slot 資料列建起來（冪等）。prompt 若後台改過就不覆蓋。
async function seed() {
  const { data: existing } = await db.from("site_images").select("slot_key, prompt");
  const known = new Map((existing ?? []).map((r) => [r.slot_key as string, r.prompt as string | null]));

  const rows = IMAGE_SLOTS.map((s) => ({
    slot_key: s.slotKey,
    group_key: s.groupKey,
    label: s.label,
    alt: s.alt,
    aspect: s.aspect,
    sort: s.sort,
    // 已存在且後台改過 prompt → 保留後台版本
    prompt: known.get(s.slotKey) || buildPrompt(s.subject),
  }));

  const { error } = await db.from("site_images").upsert(rows, { onConflict: "slot_key" });
  if (error) throw new Error(`seed: ${error.message}`);
  console.log(`✓ slot 資料列 ${rows.length} 筆已同步`);
}

async function run() {
  await seed();
  if (seedOnly) return;

  const { data: slots, error } = await db
    .from("site_images")
    .select("slot_key, label, prompt, aspect, storage_path, status")
    .order("sort");
  if (error) throw new Error(error.message);

  const todo = (slots ?? []).filter((s) => {
    if (only) return only.includes(s.slot_key);
    if (force) return true;
    return !s.storage_path; // 預設只補還沒圖的
  });

  if (todo.length === 0) {
    console.log("沒有需要生成的圖（用 --force 或 --only=<slot> 指定）");
    return;
  }
  console.log(`要生成 ${todo.length} 張，模型 ${DEFAULT_IMAGE_MODEL}\n`);

  let ok = 0;
  let fail = 0;

  for (const s of todo) {
    const t0 = Date.now();
    process.stdout.write(`· ${s.slot_key} (${s.aspect}) ${s.label} … `);
    await db.from("site_images").update({ status: "generating", error: null }).eq("slot_key", s.slot_key);

    try {
      const img = await generateImage({
        prompt: s.prompt as string,
        aspect: s.aspect as string,
        maxAttempts: 4,
      });

      // 內容雜湊當路徑 → 換圖路徑就變，不必處理 CDN 失效
      const hash = createHash("sha1").update(img.bytes).digest("hex").slice(0, 10);
      const path = `site/${s.slot_key}/${hash}.jpg`;

      const up = await db.storage.from(BUCKET).upload(path, img.bytes, {
        contentType: img.mimeType,
        upsert: true,
        cacheControl: "31536000",
      });
      if (up.error) throw new Error(`upload: ${up.error.message}`);

      const { error: uerr } = await db
        .from("site_images")
        .update({
          storage_path: path,
          public_url: publicUrl(path),
          source: "ai",
          model: img.model,
          status: "ready",
          error: null,
        })
        .eq("slot_key", s.slot_key);
      if (uerr) throw new Error(`db: ${uerr.message}`);

      // 落一份原圖 + 縮圖到 preview 目錄供人工檢查
      writeFileSync(join(previewDir, `${s.slot_key}.jpg`), img.bytes);

      ok++;
      console.log(`OK ${(img.bytes.length / 1024).toFixed(0)}KB 嘗試${img.attempts}次 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (err) {
      fail++;
      const msg = err instanceof Error ? err.message : String(err);
      await db.from("site_images").update({ status: "failed", error: msg }).eq("slot_key", s.slot_key);
      console.log(`FAIL ${msg}`);
    }
  }

  console.log(`\n完成：成功 ${ok} / 失敗 ${fail}`);
  console.log(`原圖已存到 ${previewDir}（>2000px 的圖請先 sips -Z 1024 產縮圖再看）`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

// 把 supabase/erp_data/*.json 匯入 Supabase 參照表（冪等 upsert）。
// 用法：node scripts/importErp.mjs   （需 .env.local 的 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 讀 .env.local
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing supabase env");
const db = createClient(url, key, { auth: { persistSession: false } });

const read = (f) => JSON.parse(readFileSync(join(root, "supabase/erp_data", f), "utf8"));

async function upsert(table, rows, conflict) {
  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300);
    const { error } = conflict
      ? await db.from(table).upsert(chunk, { onConflict: conflict })
      : await db.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { count } = await db.from(table).select("*", { count: "exact", head: true });
  console.log(`${table}: ${rows.length} rows in → total ${count}`);
}

// 次商品 code 非唯一 → 先清空再插入（surrogate id）
await db.from("erp_sub_products").delete().neq("id", 0);

await upsert("erp_product_master", read("product_master.json"), "code");
await upsert("erp_processing_items", read("processing_items.json"), "code");
await upsert("erp_main_products", read("main_products.json"), "code");
await upsert("erp_sub_products", read("sub_products.json"), null);

console.log("done.");
